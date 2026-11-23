import "@typespec/http";
import "@typespec/openapi";

using Http;
using TypeSpec.OpenAPI;

@service(#{ title: "Calendar API" })
namespace CalendarApi;

model HealthResponse {
  status: "ok";
}

model FieldError {
  field: string;
  code: string;
  message: string;
}

model ErrorResponse {
  code: string;
  message: string;
  details?: FieldError[];
}

@error
model BadRequestResponse {
  @statusCode _: 400;
  @body body: ErrorResponse;
}

@error
model NotFoundResponse {
  @statusCode _: 404;
  @body body: ErrorResponse;
}

@error
model ConflictResponse {
  @statusCode _: 409;
  @body body: ErrorResponse;
}

@error
model InternalServerErrorResponse {
  @statusCode _: 500;
  @body body: ErrorResponse;
}

model MeetingType {
  id: int32;
  name: string;
  description?: string;
  durationMinutes: int32;
}

union MeetingDuration {
  fifteen: 15,
  thirty: 30,
  sixty: 60,
  oneHundredTwenty: 120,
}

model CreateMeetingTypeRequest {
  @minLength(1)
  @maxLength(80)
  name: string;

  @maxLength(500)
  description?: string;

  durationMinutes: MeetingDuration;
}

model MeetingTypeCreated {
  @statusCode _: 201;
  @body body: MeetingType;
}

model Slot {
  start: offsetDateTime;
  end: offsetDateTime;
}

model AvailabilityDay {
  date: plainDate;
  slots: Slot[];
}

model MeetingTypeAvailability {
  days: AvailabilityDay[];
}

model MeetingTypeSummary {
  id: int32;
  name: string;
  durationMinutes: int32;
}

model Meeting {
  id: int32;
  meetingType: MeetingTypeSummary;
  start: offsetDateTime;
  end: offsetDateTime;
  guestName: string;
  guestEmail: string;
  guestAdditionalInfo?: string;
}

model CreateMeetingRequest {
  @minValue(1)
  meetingTypeId: int32;

  start: offsetDateTime;

  @minLength(1)
  @maxLength(100)
  guestName: string;

  @minLength(3)
  @maxLength(254)
  guestEmail: string;

  @maxLength(500)
  guestAdditionalInfo?: string;
}

model MeetingCreated {
  @statusCode _: 201;
  @body body: Meeting;
}

model CancelMeetingRequest {
  @minLength(3)
  @maxLength(254)
  guestEmail: string;
}

model MeetingCancelled {
  @statusCode _: 204;
}

@route("/health")
@get
@operationId("getHealth")
op getHealth(): HealthResponse | InternalServerErrorResponse;

@route("/meeting-types")
@get
@operationId("listMeetingTypes")
op listMeetingTypes(): MeetingType[] | BadRequestResponse | InternalServerErrorResponse;

@route("/meeting-types")
@post
@operationId("createMeetingType")
op createMeetingType(
  @body body: CreateMeetingTypeRequest,
): MeetingTypeCreated | BadRequestResponse | InternalServerErrorResponse;

@route("/meeting-types/{meetingTypeId}/availability")
@get
@operationId("getMeetingTypeAvailability")
op getMeetingTypeAvailability(
  @path @minValue(1) meetingTypeId: int32,
):
  | MeetingTypeAvailability
  | BadRequestResponse
  | NotFoundResponse
  | InternalServerErrorResponse;

@route("/meetings")
@get
@operationId("listOwnerMeetings")
op listOwnerMeetings(): Meeting[] | BadRequestResponse | InternalServerErrorResponse;

@route("/meetings")
@post
@operationId("createMeeting")
op createMeeting(
  @body body: CreateMeetingRequest,
):
  | MeetingCreated
  | BadRequestResponse
  | NotFoundResponse
  | ConflictResponse
  | InternalServerErrorResponse;

@route("/meetings/{id}/cancel")
@post
@operationId("cancelMeeting")
op cancelMeeting(
  @path @minValue(1) id: int32,
  @body body: CancelMeetingRequest,
):
  | MeetingCancelled
  | BadRequestResponse
  | NotFoundResponse
  | ConflictResponse
  | InternalServerErrorResponse;
