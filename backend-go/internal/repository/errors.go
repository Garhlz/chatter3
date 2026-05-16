// Package repository provides shared sentinel errors used by the service and
// HTTP layers for stable error matching across the system.
package repository

import "errors"

// ErrNotFound is returned when a requested entity does not exist.
var ErrNotFound = errors.New("not found")
