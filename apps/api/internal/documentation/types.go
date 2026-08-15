// Package docs names the route-registry types each module fills in.
//
// They are aliases for tronc/apiref, so a module's documentation.go stays
// written against a local package while apiref owns the shape and renders it as
// OpenAPI behind the reference page at /docs.
//
// The package is called docs and not documentation because go/build discards
// every file in a package literally named documentation; importers alias it
// back to `documentation` at the import site.
package docs

import "github.com/FacileStudio/tronc/apiref"

// Response names the registry that aggregates a module's declared routes.
// Response aliases tronc/apiref.Registry.
type Response = apiref.Registry

// Module aliases tronc/apiref.Module.
type Module = apiref.Module

// Route aliases tronc/apiref.Route.
type Route = apiref.Route

// Field aliases tronc/apiref.Field.
type Field = apiref.Field

// Error aliases tronc/apiref.Error.
type Error = apiref.Error
