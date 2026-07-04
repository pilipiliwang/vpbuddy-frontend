export type ID = string;

export type MeetingStatus = "preparing" | "recording" | "ended" | "archived";
export type MaterialType = "pptx" | "pdf" | "docx" | "xlsx" | "image" | "demo";
export type KnowledgeScope = "personal" | "enterprise" | "industry";
export type DeliverableType = "demo" | "requirements" | "tasks" | "architecture" | "api" | "summary";
export type QuestionStatus = "captured" | "concepts_found" | "explanation_drafted" | "explanation_submitted" | "sent_to_customer";
export type SourceKind = "meeting_audio" | "meeting_material" | "knowledge_personal" | "knowledge_enterprise" | "knowledge_industry" | "manual";

export interface UserProfile {
  id: ID;
  name: string;
  avatarText: string;
  organization: string;
  role: "vp" | "sales" | "pm" | "admin";
  permissions: string[];
}

export interface LoginRequest {
  account: string;
  password: string;
  remember?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: UserProfile;
}

export interface SsoStartRequest {
  organizationId?: ID;
  redirectUri: string;
}

export interface SsoStartResponse {
  authorizationUrl: string;
  state: string;
}

export interface SsoCompleteRequest {
  code: string;
  state: string;
  redirectUri: string;
}

export interface PasswordResetRequest {
  account: string;
}

export interface DeviceStatus {
  microphone: "normal" | "denied" | "missing";
  recorder: "ready" | "disabled";
  clientVersion: string;
}

export interface AudioDevice {
  id: ID;
  label: string;
  type: "microphone" | "speaker";
  status: "available" | "selected" | "denied" | "missing";
}

export interface WorkspaceStorage {
  usedBytes: number;
  totalBytes: number;
  materialBytes: number;
  deliverableBytes: number;
  temporaryBytes: number;
}

export interface MeetingSummary {
  id: ID;
  title: string;
  projectName: string;
  description: string;
  status: MeetingStatus;
  startsAt: string;
  endsAt?: string;
  coverAsset?: string;
  materialCount: number;
  deliverableCount: number;
}

export interface CreateMeetingRequest {
  projectName: string;
  title: string;
  objective?: string;
  attendeeHint?: string;
  knowledgeScopes: KnowledgeScope[];
  materialIds: ID[];
  microphoneDeviceId: string;
  recordingPolicy: "local_only" | "workspace_sync";
}

export interface MeetingDetail extends MeetingSummary {
  owner: UserProfile;
  deviceStatus: DeviceStatus;
  materials: Material[];
  events: MeetingEvent[];
  transcriptSegments: TranscriptSegment[];
  customerQuestions: CustomerQuestion[];
  questions: AIQuestion[];
  deliverables: Deliverable[];
}

export interface TranscriptSegment {
  id: ID;
  meetingId: ID;
  speakerName?: string;
  startsAtMs: number;
  endsAtMs: number;
  text: string;
  confidence: number;
  linkedMaterialId?: ID;
  linkedPageNumber?: number;
}

export interface PresentationState {
  meetingId: ID;
  activeMaterialId?: ID;
  activeDeliverableId?: ID;
  pageNumber?: number;
  zoom: number;
  mode: "host" | "fullscreen";
  tool: "cursor" | "pen" | "text" | "box";
  updatedAt: string;
}

export interface OpenInStageRequest {
  materialId?: ID;
  deliverableId?: ID;
  pageNumber?: number;
  mode?: PresentationState["mode"];
}

export interface Material {
  id: ID;
  name: string;
  type: MaterialType;
  sizeLabel: string;
  version: string;
  updatedAt: string;
  status: "available" | "processing" | "failed";
  source: "upload" | "generated" | "knowledge_base";
  visibleInMeeting: boolean;
  tags: string[];
}

export interface MaterialVersion {
  id: ID;
  materialId: ID;
  version: string;
  createdAt: string;
  createdBy: UserProfile;
  changeNote: string;
}

export interface MaterialAnnotation {
  id: ID;
  materialId: ID;
  pageNumber?: number;
  kind: "pen" | "highlight" | "text" | "box" | "screenshot";
  payload: Record<string, unknown>;
  meetingEventId?: ID;
  createdAt: string;
}

export interface MeetingEvent {
  id: ID;
  meetingId: ID;
  timeLabel: string;
  kind: "start" | "material_upload" | "ai_question" | "explanation" | "delivery" | "decision";
  title: string;
  description: string;
  materialId?: ID;
  deliverableId?: ID;
}

export interface AIQuestion {
  id: ID;
  meetingId: ID;
  text: string;
  source: "runtime" | "agent" | "user";
  status: "suggested" | "sent" | "dismissed";
}

export interface CustomerQuestion {
  id: ID;
  meetingId: ID;
  speakerName: string;
  timeLabel: string;
  transcriptSegmentId?: ID;
  text: string;
  concepts: ConceptMention[];
  status: QuestionStatus;
  explanationId?: ID;
}

export interface ConceptMention {
  id: ID;
  text: string;
  normalizedText: string;
  confidence: number;
  sourceEventIds: ID[];
}

export interface SourceReference {
  id: ID;
  kind: SourceKind;
  title: string;
  excerpt: string;
  confidence: number;
  materialId?: ID;
  knowledgeDocumentId?: ID;
  pageNumber?: number;
  transcriptSegmentId?: ID;
}

export interface ConceptSearchRequest {
  questionId: ID;
  concepts: string[];
  scopes: Array<"meeting" | KnowledgeScope>;
  limit?: number;
}

export interface ConceptSearchResponse {
  questionId: ID;
  concepts: ConceptMention[];
  sources: SourceReference[];
}

export interface ExplanationMaterial {
  id: ID;
  meetingId: ID;
  customerQuestionId: ID;
  title: string;
  summary: string;
  concepts: ConceptMention[];
  sources: SourceReference[];
  status: "draft" | "submitted" | "sent_to_customer" | "confirmed";
  sourceMaterialIds: ID[];
  confirmed: boolean;
}

export interface SubmitExplanationRequest {
  title: string;
  summary: string;
  sourceIds: ID[];
  sendToCustomer?: boolean;
}

export interface CustomerMessageRequest {
  questionId?: ID;
  explanationId?: ID;
  deliverableIds?: ID[];
  materialIds?: ID[];
  message: string;
}

export interface Deliverable {
  id: ID;
  meetingId: ID;
  type: DeliverableType;
  name: string;
  version: string;
  status: "draft" | "confirmed" | "sent";
  updatedAt: string;
  sourceEventIds: ID[];
}

export interface GenerateDeliverableRequest {
  type: DeliverableType;
  title: string;
  sourceQuestionIds?: ID[];
  sourceMaterialIds?: ID[];
  instruction?: string;
}

export interface DeliverableVersion {
  id: ID;
  deliverableId: ID;
  version: string;
  status: Deliverable["status"];
  createdAt: string;
  sourceEventIds: ID[];
  previewUrl?: string;
}

export interface KnowledgeDocument {
  id: ID;
  scope: KnowledgeScope;
  name: string;
  type: MaterialType;
  tags: string[];
  updatedAt: string;
  status: "available" | "processing";
  meetingCallable: boolean;
}

export interface KnowledgeUploadMetadata {
  scope: KnowledgeScope;
  tags: string[];
  visibleToMeetingIds?: ID[];
}

export interface MeetingArchive {
  meetingId: ID;
  conclusions: string[];
  summary: string;
  todos: TodoItem[];
  citedMaterials: Material[];
  deliverables: Deliverable[];
}

export interface ArchiveExportRequest {
  format: "docx" | "pdf" | "zip";
  includeAudio?: boolean;
  includeMaterials?: boolean;
  includeDeliverables?: boolean;
}

export interface ArchiveExportResponse {
  exportId: ID;
  status: "queued" | "processing" | "ready" | "failed";
  downloadUrl?: string;
}

export interface ShareLinkRequest {
  expiresAt?: string;
  password?: string;
  allowDownload: boolean;
  includeMaterialIds: ID[];
  includeDeliverableIds: ID[];
}

export interface ShareLinkResponse {
  id: ID;
  url: string;
  expiresAt?: string;
}

export interface TodoItem {
  id: ID;
  text: string;
  ownerName: string;
  dueDate: string;
  done: boolean;
}

export interface AISettings {
  apiKey: string;
  model: string;
  endpoint?: string;
  connected: boolean;
}

export interface VpbuddyApi {
  login(input: LoginRequest): Promise<LoginResponse>;
  startSso(input: SsoStartRequest): Promise<SsoStartResponse>;
  completeSso(input: SsoCompleteRequest): Promise<LoginResponse>;
  requestPasswordReset(input: PasswordResetRequest): Promise<{ accepted: boolean }>;
  me(): Promise<UserProfile>;
  getDeviceStatus(): Promise<DeviceStatus>;
  listDevices(): Promise<AudioDevice[]>;
  getWorkspaceStorage(): Promise<WorkspaceStorage>;
  listMeetings(): Promise<MeetingSummary[]>;
  createMeeting(input: CreateMeetingRequest): Promise<MeetingDetail>;
  getMeeting(id: ID): Promise<MeetingDetail>;
  startRecording(meetingId: ID): Promise<{ status: MeetingStatus; startedAt: string }>;
  stopRecording(meetingId: ID): Promise<{ status: MeetingStatus; endedAt: string }>;
  listMeetingEvents(meetingId: ID): Promise<MeetingEvent[]>;
  listTranscriptSegments(meetingId: ID): Promise<TranscriptSegment[]>;
  getPresentationState(meetingId: ID): Promise<PresentationState>;
  openInStage(meetingId: ID, input: OpenInStageRequest): Promise<PresentationState>;
  updatePresentationState(meetingId: ID, input: Partial<PresentationState>): Promise<PresentationState>;
  captureStageSnapshot(meetingId: ID): Promise<{ snapshotId: ID; materialId?: ID; pageNumber?: number; imageUrl: string }>;
  listMaterials(meetingId: ID): Promise<Material[]>;
  getMaterial(materialId: ID): Promise<Material>;
  listMaterialVersions(materialId: ID): Promise<MaterialVersion[]>;
  uploadMaterial(meetingId: ID, file: File): Promise<Material>;
  updateMaterialVisibility(materialId: ID, visibleInMeeting: boolean): Promise<Material>;
  createAnnotation(materialId: ID, input: Omit<MaterialAnnotation, "id" | "materialId" | "createdAt">): Promise<MaterialAnnotation>;
  appendMeetingEvent(meetingId: ID, event: Omit<MeetingEvent, "id" | "meetingId">): Promise<MeetingEvent>;
  listCustomerQuestions(meetingId: ID): Promise<CustomerQuestion[]>;
  updateCustomerQuestion(questionId: ID, input: Partial<Pick<CustomerQuestion, "status" | "concepts">>): Promise<CustomerQuestion>;
  listAIQuestions(meetingId: ID): Promise<AIQuestion[]>;
  sendAIQuestion(meetingId: ID, text: string): Promise<AIQuestion>;
  searchConcepts(meetingId: ID, input: ConceptSearchRequest): Promise<ConceptSearchResponse>;
  generateExplanation(meetingId: ID, sourceId: ID): Promise<ExplanationMaterial>;
  submitExplanation(questionId: ID, input: SubmitExplanationRequest): Promise<ExplanationMaterial>;
  sendCustomerMessage(meetingId: ID, input: CustomerMessageRequest): Promise<{ sent: boolean; messageId: ID }>;
  listDeliverables(meetingId: ID): Promise<Deliverable[]>;
  getDeliverable(deliverableId: ID): Promise<Deliverable>;
  generateDeliverable(meetingId: ID, input: GenerateDeliverableRequest): Promise<Deliverable>;
  listDeliverableVersions(deliverableId: ID): Promise<DeliverableVersion[]>;
  updateDeliverableVersion(deliverableId: ID, version: string): Promise<Deliverable>;
  archiveMeeting(meetingId: ID): Promise<MeetingArchive>;
  exportArchive(meetingId: ID, input: ArchiveExportRequest): Promise<ArchiveExportResponse>;
  createShareLink(meetingId: ID, input: ShareLinkRequest): Promise<ShareLinkResponse>;
  listKnowledge(scope?: KnowledgeScope): Promise<KnowledgeDocument[]>;
  getKnowledgeDocument(id: ID): Promise<KnowledgeDocument>;
  uploadKnowledgeDocument(file: File, metadata: KnowledgeUploadMetadata): Promise<KnowledgeDocument>;
  addKnowledgeTag(id: ID, tag: string): Promise<KnowledgeDocument>;
  updateKnowledgeMeetingCallable(id: ID, meetingCallable: boolean): Promise<KnowledgeDocument>;
  saveAISettings(input: AISettings): Promise<AISettings>;
  testAIConnection(input: AISettings): Promise<{ connected: boolean; latencyMs: number }>;
}
