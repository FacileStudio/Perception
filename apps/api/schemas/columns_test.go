package schemas

import (
	"context"
	"os"
	"reflect"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/FacileStudio/Perception/apps/api/migrations"
	"github.com/FacileStudio/tronc/testdb"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

const (
	bootstrap = "mise run db-up"
	prefix    = "perception_schemas_test"
)

var (
	models     = []any{&Event{}, &IngestRejection{}, &EventEmbedding{}}
	timeType   = reflect.TypeFor[time.Time]()
	vectorType = reflect.TypeFor[Vector]()
	database   *gorm.DB
)

func TestMain(m *testing.M) {
	url, ok := testdb.URL()
	if !ok {
		testdb.Announce(bootstrap)
		os.Exit(m.Run())
	}
	opened, err := freshSchema(url)
	if err != nil {
		panic(err)
	}
	database = opened
	os.Exit(m.Run())
}

// freshSchema drops the schema a previous run left behind and migrates a new
// one, so the check reads what the migrations build today rather than the
// tables an earlier version of them, or AutoMigrate, built.
func freshSchema(url string) (*gorm.DB, error) {
	admin, err := testdb.Open(url, testdb.Config{Prefix: prefix + "_admin", Migrate: func(*gorm.DB) error { return nil }})
	if err != nil {
		return nil, err
	}
	if err := admin.Exec(`DROP SCHEMA IF EXISTS "` + testdb.SchemaName(prefix) + `" CASCADE`).Error; err != nil {
		return nil, err
	}
	return testdb.Open(url, testdb.Config{Prefix: prefix, Migrate: migrateUp})
}

func migrateUp(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return migrations.Up(context.Background(), migrations.Config(sqlDB, nil))
}

// compatibleTypes lists the information_schema data types a field can hold.
func compatibleTypes(field reflect.Type) []string {
	for field.Kind() == reflect.Pointer {
		field = field.Elem()
	}
	switch field {
	case timeType:
		return []string{"timestamp with time zone"}
	case vectorType:
		return []string{"USER-DEFINED"}
	}
	switch field.Kind() {
	case reflect.String:
		return []string{"text", "character varying"}
	case reflect.Bool:
		return []string{"boolean"}
	case reflect.Int, reflect.Int64:
		return []string{"bigint"}
	case reflect.Slice:
		return []string{"jsonb", "bytea"}
	default:
		return nil
	}
}

func migratedColumnTypes(t *testing.T, table string) map[string]string {
	t.Helper()
	var rows []struct {
		ColumnName string
		DataType   string
	}
	err := database.Raw(`SELECT column_name, data_type FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = ?`, table).Scan(&rows).Error
	if err != nil {
		t.Fatalf("read the columns of %s: %v", table, err)
	}
	columns := map[string]string{}
	for _, row := range rows {
		columns[row.ColumnName] = row.DataType
	}
	return columns
}

// TestGORMModelsMatchTheMigratedSchema checks every column a GORM model reads
// or writes exists in the schema the migrations build, with a type the field
// can hold. AutoMigrate no longer adds a missing column, so a field added to a
// struct without a migration fails here instead of at query time.
func TestGORMModelsMatchTheMigratedSchema(t *testing.T) {
	if database == nil {
		t.Skip(testdb.SkipReason(bootstrap))
	}
	for _, model := range models {
		parsed, err := schema.Parse(model, &sync.Map{}, database.NamingStrategy)
		if err != nil {
			t.Fatalf("parse %T: %v", model, err)
		}
		columns := migratedColumnTypes(t, parsed.Table)
		if len(columns) == 0 {
			t.Errorf("%T: table %s does not exist", model, parsed.Table)
			continue
		}
		for _, field := range parsed.Fields {
			if field.DBName == "" {
				continue
			}
			got, ok := columns[field.DBName]
			if !ok {
				t.Errorf("%s.%s: no such column", parsed.Table, field.DBName)
				continue
			}
			if want := compatibleTypes(field.FieldType); !slices.Contains(want, got) {
				t.Errorf("%s.%s: column is %s, field %s needs one of %v", parsed.Table, field.DBName, got, field.FieldType, want)
			}
		}
	}
}
