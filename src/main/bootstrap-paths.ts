import { app } from 'electron'
import { join } from 'path'

// Pin userData to a stable path so renaming the app never migrates the data dir.
// MUST be imported before any module that constructs services which call
// app.getPath('userData') at construction time (e.g. ./ipc-handlers constructs
// KnowledgeBaseService/DocumentService/ChatService/etc. at module load, caching
// the path). ES imports execute in source order, so importing this file first
// guarantees setPath runs before those service constructors.
app.setPath('userData', join(app.getPath('appData'), 'rag-knowledge-base'))
