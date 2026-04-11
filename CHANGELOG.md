# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-11

### Added
- `claudectx analyze` command — visual token breakdown per context component
- Token counting using js-tiktoken (cl100k_base, within 2-5% of Claude)
- Waste detection for 8 patterns: OVERSIZED_CLAUDEMD, MISSING_IGNOREFILE, CACHE_BUSTING_CONTENT, OVERSIZED_MEMORY, LARGE_REFERENCE_FILE, TOO_MANY_REFERENCES, REDUNDANT_CONTENT, NO_CACHING_CONFIGURED
- Cost estimation for claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-6
- `--json`, `--model`, `--watch`, `--path` flags for analyze command
- Project root auto-detection via CLAUDE.md / .claude/ directory walk
