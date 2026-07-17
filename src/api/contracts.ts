export type ID = string;
export type ISODateTime = string;
export type AudioSource = "microphone" | "loopback" | "both";
export type MeetingPlatform = "local" | "tencent" | "dingtalk" | "wecom";
export type DocKind = "req" | "arch" | "tasks" | "api" | "risk" | "demo";
export type KnowledgeScope = "personal_kb" | "enterprise" | "industry";

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthSession {
  user_id: ID;
  email: string;
  token: string;
}

export interface AuthUser {
  user_id: ID;
  email: string;
  created_at: ISODateTime;
}

export interface MeetingListItem {
  meeting_id: ID;
  owner_id: ID;
  platform: MeetingPlatform | "unknown";
  audio_source: AudioSource;
  project_name: string | null;
  started_at: ISODateTime | null;
  last_updated: ISODateTime | null;
  item_count: number;
  cleaned_text_length: number;
}

export interface MeetingListResponse {
  meetings: MeetingListItem[];
  count: number;
}

export interface CreateMeetingRequest {
  meeting_id?: ID;
  audio_source?: AudioSource;
  project_name?: string;
}

export interface CreateMeetingResponse {
  meeting_id: ID;
  audio_source: AudioSource;
  reused: boolean;
  message: string;
}

export interface MeetingIdCheckResponse {
  id: ID;
  valid: true;
  exists: boolean;
}

export type ItemPriority = "high" | "medium" | "low";
export type ItemStatus = "pending" | "confirmed" | "rejected";
export type MeetingItemType = "req" | "goal" | "feat" | "risk" | "que";

export interface MeetingStateItem {
  id: ID;
  type: MeetingItemType;
  text: string;
  priority: ItemPriority;
  status: ItemStatus;
  speaker_name: string | null;
  created_at: ISODateTime | null;
}

export interface TrackedMeetingItem {
  id: ID;
  text: string;
  priority: ItemPriority;
  status: ItemStatus;
  speaker_id: string | null;
  speaker_name: string | null;
  source_segment_id: ID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  prefix?: string;
  severity?: ItemPriority;
  is_urgent?: boolean;
}

export interface MeetingStateSummary {
  meeting_id: ID;
  owner_id: ID;
  cleaned_text_length: number;
  last_updated: ISODateTime;
  audio_source: AudioSource;
  platform: MeetingPlatform;
  items: MeetingStateItem[];
}

export interface MeetingStateRecord {
  meeting_id: ID;
  platform: MeetingPlatform;
  audio_source: AudioSource;
  owner_id: ID;
  project_name: string | null;
  started_at: ISODateTime;
  requirements: TrackedMeetingItem[];
  goals: TrackedMeetingItem[];
  features: TrackedMeetingItem[];
  risks: TrackedMeetingItem[];
  open_questions: TrackedMeetingItem[];
  cleaned_text: string;
  speaker_map: Record<string, string>;
  last_updated: ISODateTime;
  vpbuddy_version: string;
}

export interface TranscriptSegment {
  id?: ID;
  text: string;
  begin_time?: number;
  end_time?: number;
  start_sec?: number;
  end_sec?: number;
  is_sentence_end?: boolean;
  is_noise?: boolean;
  speaker_id?: string;
  speaker_name?: string | null;
  [key: string]: unknown;
}

export interface Material {
  id: ID;
  meeting_id: ID;
  filename: string;
  content_type: string;
  size: number;
  created_at: ISODateTime;
  status: "stored" | string;
}

export interface MaterialListResponse {
  meeting_id: ID;
  materials: Material[];
  count: number;
}

export interface MeetingStateResponse {
  state: MeetingStateSummary;
  transcript_segments: TranscriptSegment[];
  metrics: Record<string, unknown>[];
  processed_chunks: unknown[];
  materials: Material[];
}

export interface MeetingDetailResponse {
  id: ID;
  state: MeetingStateRecord | null;
  cleaned_text_length: number;
  docs: Array<{ kind: DocKind; label: string; path: string }>;
  transcript_segments: TranscriptSegment[];
  materials: Material[];
  state_error?: string;
  docs_error?: string;
}

export interface MeetingAggregateResponse {
  meeting_id: ID;
  state?: MeetingStateRecord | null;
  docs?: MeetingDocument[];
  collab?: Omit<CollaborationResponse, "meeting_id">;
  experiences?: Record<string, unknown>[];
  state_error?: string;
  docs_error?: string;
  collab_error?: string;
}

export interface UpdateMeetingRequest {
  project_name: string;
}

export interface UpdateMeetingResponse {
  meeting_id: ID;
  project_name: string;
}

export interface CloseMeetingResponse {
  meeting_id: ID;
  status: "closed";
  details: unknown;
}

export interface DeleteMeetingResponse {
  meeting_id: ID;
  deleted: {
    state: boolean;
    chat: boolean;
    materials: number;
    docs: boolean;
    stream_meta: boolean;
  };
}

export interface RecordingStartResponse {
  status: "recording";
  started_at: ISODateTime;
  detail: unknown;
}

export interface RecordingStopResponse {
  status: "stopped";
  ended_at: ISODateTime;
  detail: unknown;
}

export interface MaterialDeleteResponse {
  deleted: boolean;
  material_id: ID;
}

export interface ChatMessage {
  id: ID;
  meeting_id: ID;
  role: "user" | "assistant" | string;
  content: string;
  source: string;
  status: string;
  created_at: ISODateTime;
  context?: Record<string, unknown>;
  attachments?: ChatUploadFileResult[];
  error?: string | null;
  attachment_count?: number;
}

export interface ChatRequest {
  message: string;
  role?: string;
  context?: Record<string, unknown>;
}

export interface ChatResponse {
  meeting_id: ID;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  status: string;
  source: string;
  error: string | null;
}

export interface ChatUploadFileResult {
  filename: string;
  status: "rejected" | "image" | "empty" | "duplicate" | "kb-stored" | "error";
  error?: string;
  doc_id?: ID;
  chars?: number;
  data_uri_length?: number;
  path?: string;
}

export interface ChatUploadResult {
  status: 200;
  meeting_id: ID;
  text: string;
  files: ChatUploadFileResult[];
  kb_doc_ids: ID[];
  image_count: number;
}

export interface ChatAttachmentResponse extends ChatResponse {
  upload: ChatUploadResult;
}

export interface ChatHistoryResponse {
  meeting_id: ID;
  messages: ChatMessage[];
}

export interface CollaborationQuestion {
  qid: ID;
  section: string;
  content?: string;
  text?: string;
  question?: string;
  suggestion?: string;
  asked_by: string;
  asked_at: ISODateTime;
  answered_by?: string;
  answered_at?: ISODateTime;
  answer?: string;
}

export interface CollaborationStats {
  meeting_id: ID;
  total: number;
  pending: number;
  answered: number;
  by_section_pending: Record<string, number>;
  exists: boolean;
}

export interface CollaborationResponse {
  meeting_id: ID;
  collab: string;
  pending: CollaborationQuestion[];
  answered: CollaborationQuestion[];
  stats: CollaborationStats;
}

export interface CollaborationAskRequest {
  section: string;
  question: string;
  asker?: string;
}

export interface CollaborationAskResponse {
  ok: true;
  qid: ID;
  status: "added" | "throttled" | "duplicate_exact";
  reason?: string;
}

export interface CollaborationAnswerRequest {
  qid: ID;
  answer: string;
  answerer?: string;
}

export interface CollaborationAnswerResponse {
  ok: true;
  qid: ID;
  status: "answered";
}

export interface MeetingDocument {
  meeting_id: ID;
  kind: DocKind;
  label: string;
  content: string;
  version: string;
  doc_size: number;
  status: "pending" | "stored";
  updated_at: ISODateTime;
}

export interface MeetingDocumentsResponse {
  meeting_id: ID;
  docs: MeetingDocument[];
}

export interface DemoVersion {
  version: number;
  created_at: ISODateTime;
  summary: string;
  file_size: number;
  file: string;
  trigger?: string;
}

export interface DemoVersionsResponse {
  meeting_id: ID;
  versions: DemoVersion[];
  count: number;
}

export interface KnowledgeMetadata {
  user_id?: ID;
  meeting_id?: ID;
  source?: string;
  uploaded_at?: ISODateTime;
  chunk_index?: number;
  file_size?: number;
  file_ext?: string;
  content_hash?: string;
  scope?: KnowledgeScope;
  labels?: string;
  meeting_callable?: "true" | "false";
  [key: string]: unknown;
}

export interface KnowledgeDocument {
  id: ID;
  document: string;
  distance: number;
  metadata: KnowledgeMetadata;
}

export interface KnowledgeListResponse {
  total: number;
  meeting_id: ID | null;
  docs: KnowledgeDocument[];
}

export interface KnowledgeSearchRequest {
  query: string;
  top_k?: number;
  meeting_id?: ID;
  scope?: string;
}

export interface KnowledgeSearchResponse {
  results: KnowledgeDocument[];
  count: number;
  scope: string;
  meeting_id: ID | null;
}

export interface KnowledgeUploadInput {
  meeting_id: ID;
  scope?: KnowledgeScope;
  labels?: string | string[];
  meeting_callable?: boolean | "true" | "false";
}

export interface KnowledgeUploadResponse {
  status: 200;
  doc_id: ID;
  meeting_id: ID;
  filename: string;
  chunks: number;
  char_count: number;
  duplicate?: boolean;
  scope?: KnowledgeScope;
  labels?: string;
  meeting_callable?: "true" | "false";
}

export interface KnowledgeDeleteResponse {
  status: 200;
  doc_id: ID;
}

export interface AISettingsResponse {
  provider: string;
  model: string;
  base_url: string;
  api_key_configured: boolean;
  status?: "not_configured";
  api_key_masked?: string;
  updated_at?: ISODateTime;
}

export interface AISettingsUpdateRequest {
  provider?: string;
  model?: string;
  base_url?: string;
  api_key?: string;
}

export interface AISettingsUpdateResponse {
  status: "saved";
  updated_at: ISODateTime;
}

export type AIConnectionTestResponse =
  | {
      status: "connected";
      connected: true;
      model: string;
      provider: string;
      elapsed_ms: number;
    }
  | {
      status: "failed";
      connected: false;
      error: string;
      model?: string;
      elapsed_ms?: number;
    };

/** Authenticated file responses are normalized by client.js to this shape. */
export interface VpbuddyDownload {
  blob: Blob;
  filename: string;
  contentType: string;
}

export interface AsrTranscriptPayload {
  text: string;
  begin_time: number;
  end_time: number;
  is_sentence_end: boolean;
  is_noise?: boolean;
  speaker_id?: string;
}

export interface SseEventDataMap {
  connected: { meeting_id: ID; subscribers: number };
  heartbeat: { type: "heartbeat"; ts: number };
  timeout: { type: "timeout" };
  "doc-update": {
    meeting_id?: ID;
    kind: DocKind;
    status: "stored" | string;
    doc_size: number;
    updated_at?: ISODateTime;
    is_demo?: boolean;
    content?: string;
  };
  "demo-new-version": { version: number; summary: string; file_size: number; file: string };
  "chat-message": ChatMessage;
  "collab-update": {
    action: "ask" | "answer";
    qid: ID;
    status: string;
    section?: string;
    question?: string;
    asker?: string;
    answer?: string;
    answerer?: string;
  };
  "meeting-complete": { meeting_id: ID; status: "user_closed"; note: string };
  "recording-disconnected": { meeting_id: ID; sentences: number };
}

export type SseEventName = keyof SseEventDataMap;
export type SseEvent = {
  [K in SseEventName]: {
    type: K;
    event: K;
    data: SseEventDataMap[K];
    rawData: string;
    id: string;
  };
}[SseEventName];

export type RealtimeAsrClientControl =
  | { type: "start"; format: "pcm"; sample_rate: 16000 }
  | { type: "ping" }
  | { type: "stop" };

// Audio frames sent after start are 16 kHz mono signed PCM16 little-endian bytes.
export type RealtimeAsrServerMessage =
  | { type: "asr_status"; status: "connected" | "closed" }
  | ({ type: "transcript" } & AsrTranscriptPayload)
  | { type: "asr_complete"; sentence_count: number; full_text: string }
  | { type: "asr_error"; error: string }
  | { type: "error"; error: string }
  | { type: "pong" };

export type CurrentBackendRoute =
  | "POST /api/auth/register"
  | "POST /api/auth/login"
  | "GET /api/auth/me"
  | "GET /api/client/device-status"
  | "GET /api/meetings"
  | "GET /api/meetings/check_id"
  | "POST /api/meetings/stream_start"
  | "GET /api/meetings/:id"
  | "GET /api/meetings/:id/aggregate"
  | "GET /api/meetings/:id/state"
  | "PATCH /api/meetings/:id"
  | "DELETE /api/meetings/:id"
  | "POST /api/meetings/:id/close"
  | "POST /meetings/:id/recording/start"
  | "POST /meetings/:id/recording/stop"
  | "GET /api/meetings/:id/materials"
  | "POST /api/meetings/:id/materials"
  | "GET /api/materials/:id"
  | "DELETE /api/materials/:id"
  | "GET /api/materials/:id/file"
  | "POST /api/meetings/:id/chat"
  | "GET /api/meetings/:id/chat/history"
  | "GET /api/meetings/:id/collab"
  | "POST /api/meetings/:id/collab/ask"
  | "POST /api/meetings/:id/collab/answer"
  | "GET /api/meetings/:id/docs"
  | "GET /api/meetings/:id/docs/:kind"
  | "GET /api/meetings/:id/docs/:kind/download"
  | "GET /api/meetings/:id/demo/versions"
  | "GET /api/kb/list"
  | "POST /api/kb/search"
  | "POST /api/kb/upload"
  | "DELETE /api/kb/:id"
  | "GET /api/kb/:id/file"
  | "GET /api/settings/ai"
  | "PUT /api/settings/ai"
  | "POST /api/settings/ai/test"
  | "GET /api/meetings/:id/events"
  | "WS /api/meetings/:id/realtime_asr";

/** The callable surface implemented by src/api/client.js at this revision. */
export interface CurrentBackendApi {
  readonly baseUrl: string;
  eventsUrl(meetingId: ID): string;
  register(input: AuthCredentials): Promise<AuthSession>;
  login(input: AuthCredentials): Promise<AuthSession>;
  me(): Promise<AuthUser>;
  getDeviceStatus(): Promise<{
    version: string;
    audio: { available: boolean; platform: string };
    recording: { active_meetings: number };
  }>;

  listMeetings(): Promise<MeetingListResponse>;
  checkMeetingId(id: ID): Promise<MeetingIdCheckResponse>;
  checkMeeting(id: ID): Promise<MeetingIdCheckResponse>;
  createMeeting(input?: CreateMeetingRequest): Promise<CreateMeetingResponse>;
  getMeeting(meetingId: ID): Promise<MeetingDetailResponse>;
  getMeetingAggregate(meetingId: ID): Promise<MeetingAggregateResponse>;
  updateMeeting(meetingId: ID, input: UpdateMeetingRequest): Promise<UpdateMeetingResponse>;
  patchMeeting(meetingId: ID, input: UpdateMeetingRequest): Promise<UpdateMeetingResponse>;
  deleteMeeting(meetingId: ID): Promise<DeleteMeetingResponse>;
  startRecording(meetingId: ID): Promise<RecordingStartResponse>;
  stopRecording(meetingId: ID): Promise<RecordingStopResponse>;
  closeMeeting(meetingId: ID): Promise<CloseMeetingResponse>;
  archiveMeeting(meetingId: ID): Promise<CloseMeetingResponse>;
  /** This client alias targets an SSE stream and must not be used as a JSON request. */
  listMeetingEvents(meetingId: ID): Promise<never>;
  /** Current alias returns the complete state response, not only the segment array. */
  listTranscriptSegments(meetingId: ID): Promise<MeetingStateResponse>;

  listMaterials(meetingId: ID): Promise<MaterialListResponse>;
  getMaterial(materialId: ID): Promise<Material>;
  uploadMaterial(meetingId: ID, file: File): Promise<Material>;
  deleteMaterial(materialId: ID): Promise<MaterialDeleteResponse>;
  downloadMaterial(materialId: ID): Promise<VpbuddyDownload>;
  downloadMaterialFile(materialId: ID): Promise<VpbuddyDownload>;
  getMaterialFile(materialId: ID): Promise<VpbuddyDownload>;

  sendChat(meetingId: ID, message: string, role?: string): Promise<ChatResponse>;
  sendChatAttachment(meetingId: ID, file: File, text?: string): Promise<ChatAttachmentResponse>;
  listChatHistory(meetingId: ID): Promise<ChatHistoryResponse>;
  getMeetingCollab(meetingId: ID): Promise<CollaborationResponse>;
  askCollab(meetingId: ID, input: CollaborationAskRequest): Promise<CollaborationAskResponse>;
  askCollab(meetingId: ID, section: string, question: string, asker?: string): Promise<CollaborationAskResponse>;
  answerCollab(meetingId: ID, input: CollaborationAnswerRequest): Promise<CollaborationAnswerResponse>;
  answerCollab(meetingId: ID, qid: ID, answer: string, answerer?: string): Promise<CollaborationAnswerResponse>;

  listDeliverables(meetingId: ID): Promise<MeetingDocumentsResponse>;
  getMeetingDocument(meetingId: ID, kind: DocKind): Promise<MeetingDocument>;
  getDocument(meetingId: ID, kind: DocKind): Promise<MeetingDocument>;
  getDeliverable(meetingId: ID, kind: DocKind): Promise<MeetingDocument>;
  downloadMeetingDocument(meetingId: ID, kind: DocKind): Promise<VpbuddyDownload>;
  downloadDocument(meetingId: ID, kind: DocKind): Promise<VpbuddyDownload>;
  downloadDeliverable(meetingId: ID, kind: DocKind): Promise<VpbuddyDownload>;
  listDemoVersions(meetingId: ID): Promise<DemoVersionsResponse>;
  getDemoVersions(meetingId: ID): Promise<DemoVersionsResponse>;

  listKnowledge(input?: ID | { meeting_id?: ID; meetingId?: ID }): Promise<KnowledgeListResponse>;
  listKnowledgeDocuments(input?: ID | { meeting_id?: ID; meetingId?: ID }): Promise<KnowledgeListResponse>;
  searchKnowledge(input: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse>;
  uploadKnowledgeDocument(file: File, input: KnowledgeUploadInput): Promise<KnowledgeUploadResponse>;
  deleteKnowledgeDocument(docId: ID): Promise<KnowledgeDeleteResponse>;
  deleteKnowledge(docId: ID): Promise<KnowledgeDeleteResponse>;
  downloadKnowledgeDocument(docId: ID): Promise<VpbuddyDownload>;
  downloadKnowledgeFile(docId: ID): Promise<VpbuddyDownload>;
  getKnowledgeFile(docId: ID): Promise<VpbuddyDownload>;

  getAISettings(): Promise<AISettingsResponse>;
  loadAISettings(): Promise<AISettingsResponse>;
  saveAISettings(input: AISettingsUpdateRequest): Promise<AISettingsUpdateResponse>;
  testAIConnection(): Promise<AIConnectionTestResponse>;
  requestBlob(path: string, options?: RequestInit): Promise<VpbuddyDownload>;
}

/** Formal-UI domains for which the current FastAPI app has no complete API. */
export type ProductBackendGaps =
  | "sso_and_password_recovery"
  | "user_profile_and_account_data_management"
  | "meeting_independent_personal_knowledge_upload"
  | "meeting_status_and_closed_at_persistence"
  | "speaker_diarization_and_persisted_realtime_segments"
  | "structured_customer_questions_explanations_and_submission"
  | "meeting_timeline_and_structured_summary"
  | "knowledge_metadata_update_and_scope_filtering"
  | "presentation_state_annotation_and_snapshot_persistence"
  | "office_document_page_preview_and_thumbnails"
  | "material_versions_visibility_and_tags"
  | "non_demo_deliverable_version_history_and_selection"
  | "customer_delivery_archive_export_and_share_links";
