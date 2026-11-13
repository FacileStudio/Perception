# Changelog

## [0.1.2] - 2026-11-13

### Security

- Bump golang.org/x/crypto to 0.59.0, with x/sync 0.25.0, x/sys 0.50.0 and x/text 0.44.0. It clears GO-2026-5932, which douane reported as a scan gap because the advisory has no severity.

## [0.1.1] - 2026-11-11

### Fixed

- The favicon, touch and manifest icons, link preview image and web manifest come from the muse v0.19.0 brand generator, and the head carries the suite's canonical title, description, theme colours and Open Graph and Twitter tags. The home page title matches the suite catalog.

## [0.1.0] - 2026-11-11

### Added

- First tagged release.

### Security

- Build with Go 1.26.11.
- Bump golang.org/x/crypto to 0.58.0, with x/sync, x/sys and x/text, go-chi to 5.4.0 and go-jose to 4.1.6.
- Bump vite to 7.3.8 and pin patched devalue, source-map-js and cookie.
