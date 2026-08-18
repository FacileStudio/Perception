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

// porteKits are the packages that can verify or issue a credential. Two porte
// packages are deliberately absent:
//
//   - `porte` itself is types and interfaces over the standard library, and
//     the middleware has to read the identity porte left in the context.
//   - `porte/pg` is table access and DDL. schemas/migrate.go creates porte's
//     tables from it, which is where a migration belongs; holding a store
//     authenticates nobody, and handing one to a second session manager is
//     blocked by session being on this list.
var porteKits = map[string]bool{
	"github.com/FacileStudio/porte/session": true,
	"github.com/FacileStudio/porte/local":   true,
	"github.com/FacileStudio/porte/oidc":    true,
}

// TestAuthSeamHolds guards the seam porte arrived through, in both directions.
//
// The property is the one this repository was scaffolded around and it did its
// job: swapping the hand-rolled auth module for porte was a change to one
// constructor call, because nothing outside main.go named the implementation.
// Keeping it costs nothing and keeps the next swap — porte's own next major,
// or whatever replaces it — just as cheap.
//
// Two rules, which together say "the implementation has exactly one seam":
//
//   - modules/auth is imported by main.go alone. It is the adapter, so it is
//     allowed to know porte; every feature module takes
//     identity.Authenticator as a parameter and cannot tell what is mounted.
//   - The porte kits are imported by main.go and modules/auth alone. The
//     moment a third package builds a session manager, there are two ideas of
//     what a session is, each with its own clock and its own cookie policy.
//
// Test files in package main are allowed: they are the same compilation unit
// as main.go and construct the same router.
func TestAuthSeamHolds(t *testing.T) {
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
		inAuthModule := filepath.Dir(path) == filepath.Join("modules", "auth")
		for _, imported := range file.Imports {
			value, unquoteErr := strconv.Unquote(imported.Path.Value)
			if unquoteErr != nil {
				return unquoteErr
			}
			switch {
			case value == authModulePath:
				offenders = append(offenders, path+" imports the auth module")
			case porteKits[value] && !inAuthModule:
				offenders = append(offenders, path+" imports "+value)
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
			"the auth seam is broken:\n  %s\n\n"+
				"Only main.go may name modules/auth, and only main.go and modules/auth may\n"+
				"build a porte kit. Depend on internal/identity.Authenticator instead, and\n"+
				"take it as a parameter rather than importing the implementation.",
			strings.Join(offenders, "\n  "),
		)
	}
}

func isMainPackageFile(path string) bool {
	return filepath.Dir(path) == "."
}
