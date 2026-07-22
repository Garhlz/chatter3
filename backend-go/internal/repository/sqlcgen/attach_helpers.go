package sqlcgen

// FileAttacher is implemented by history row types that carry optional file
// metadata from a LEFT JOIN on the files table.
type FileAttacher interface {
	GetFileID() *int64
	GetFileName() *string
	GetStoredFileName() *string
	GetFileSize() *int64
	GetFileType() *string
}

func (r GetPublicHistoryRow) GetFileID() *int64          { return r.FileID }
func (r GetPublicHistoryRow) GetFileName() *string       { return r.FileName }
func (r GetPublicHistoryRow) GetStoredFileName() *string { return r.StoredFileName }
func (r GetPublicHistoryRow) GetFileSize() *int64        { return r.FileSize }
func (r GetPublicHistoryRow) GetFileType() *string       { return r.FileType }

func (r GetPrivateHistoryRow) GetFileID() *int64          { return r.FileID }
func (r GetPrivateHistoryRow) GetFileName() *string       { return r.FileName }
func (r GetPrivateHistoryRow) GetStoredFileName() *string { return r.StoredFileName }
func (r GetPrivateHistoryRow) GetFileSize() *int64        { return r.FileSize }
func (r GetPrivateHistoryRow) GetFileType() *string       { return r.FileType }

func (r GetGroupHistoryRow) GetFileID() *int64          { return r.FileID }
func (r GetGroupHistoryRow) GetFileName() *string       { return r.FileName }
func (r GetGroupHistoryRow) GetStoredFileName() *string { return r.StoredFileName }
func (r GetGroupHistoryRow) GetFileSize() *int64        { return r.FileSize }
func (r GetGroupHistoryRow) GetFileType() *string       { return r.FileType }
