package main

import (
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

const authModulePath = "github.com/FacileStudio/Perception/apps/api/modules/auth"

// TestAuthModuleIsImportedByMainAlone guards the porte seam.
//
// Authentication is going to move out of this repository into the shared porte
// package. That is a one-line change in main.go for as long as main.go is the
// only place that names modules/auth: everything else depends on
// internal/identity.Authenticator and cannot tell which implementation is
// mounted. The moment a second package imports modules/auth, the extraction
// stops being mechanical and starts being a refactor.
//
// Test files in package main are allowed: they are the same compilation unit as
// main.go and construct the same router.
func TestAuthModuleIsImportedByMainAlone(t *testing.T) {
	var offenders []string

	err := filepath.WalkDir(".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if entry.Name() != "." && strings.HasPrefix(entry.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || isMainPackageFile(path) {
			return nil
		}

		file, parseErr := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if parseErr != nil {
			return parseErr
		}
		for _, imported := range file.Imports {
			value, unquoteErr := strconv.Unquote(imported.Path.Value)
			if unquoteErr != nil {
				return unquoteErr
			}
			if value == authModulePath {
				offenders = append(offenders, path)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walking the source tree: %v", err)
	}

	if len(offenders) > 0 {
		sort.Strings(offenders)
		t.Errorf(
			"%s is imported outside package main:\n  %s\n\n"+
				"Only main.go may name the auth module, so swapping it for porte stays a\n"+
				"one-line change. Depend on internal/identity.Authenticator instead, and take\n"+
				"it as a parameter rather than importing the concrete service.",
			authModulePath, strings.Join(offenders, "\n  "),
		)
	}
}

func isMainPackageFile(path string) bool {
	return filepath.Dir(path) == "."
}
