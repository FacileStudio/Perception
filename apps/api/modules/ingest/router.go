package ingest

import (
	"io"
	"net/http"
	"time"

	"github.com/FacileStudio/Perception/apps/api/internal/identity"
	"github.com/FacileStudio/Perception/apps/api/internal/middleware"
	"github.com/FacileStudio/tronc/errors"
	"github.com/FacileStudio/tronc/httpjson"
	troncmiddleware "github.com/FacileStudio/tronc/middleware"

	"github.com/go-chi/chi/v5"
)

// Route paths.
const (
	PathIngest     = "/ingest"
	PathRejections = "/ingest/rejections"
)

// ingestRate bounds an unauthenticated endpoint.
//
// It is generous on purpose. The old corpus averaged around a hundred events a
// day, so nothing legitimate comes near this even during a burst — and the
// endpoint's one real caller must never be the thing that gets throttled. What
// it does is put a ceiling on how fast a stranger can make Perception write.
const (
	ingestPerMinute = 120
	ingestWindow    = time.Minute
)

// maxBodyBytes caps a delivery.
//
// The largest event in the old corpus was well under a megabyte; this leaves
// room for a provider that attaches more than it should while keeping a
// mistake from becoming a memory problem. It is enforced before the signature
// is checked, because reading an unbounded body to verify it is the same
// mistake with an extra step.
const maxBodyBytes = 4 << 20

// RegisterRoutes mounts the ingest endpoint and the rejection log.
//
// Ingest is unauthenticated by design: the HMAC signature is the credential,
// and requiring a session as well would mean Antenne holding one. The
// rejection log is a human's view of the same data and takes the session.
func RegisterRoutes(router chi.Router, service *Service, controller *Controller, authenticator identity.Authenticator) {
	limiter := middleware.NewRateLimiter(ingestPerMinute, ingestWindow)

	router.With(middleware.RateLimit(limiter)).Post(PathIngest, func(w http.ResponseWriter, request *http.Request) {
		body, err := io.ReadAll(io.LimitReader(request.Body, maxBodyBytes+1))
		if err != nil {
			httpjson.WriteError(w, errors.Invalid("could not read the request body"))
			return
		}

		delivery := delivery{
			eventID:       request.Header.Get(HeaderEventID),
			timestamp:     request.Header.Get(HeaderTimestamp),
			schemaVersion: request.Header.Get(HeaderSchemaVersion),
			signature:     request.Header.Get(HeaderSignature),
			body:          body,
			clientIP:      troncmiddleware.ClientIP(request),
		}

		if len(body) > maxBodyBytes {
			refuse(w, request, service, delivery, ReasonTooLarge)
			return
		}
		if reason := controller.admit(delivery); reason != "" {
			refuse(w, request, service, delivery, reason)
			return
		}

		response, reason := controller.accept(request.Context(), delivery)
		switch {
		case reason != "":
			refuse(w, request, service, delivery, reason)
		case response == nil:
			httpjson.WriteError(w, errors.Internal("failed to store the event", nil))
		default:
			httpjson.WriteJSON(w, http.StatusAccepted, response)
		}
	})

	router.With(middleware.RequireAuth(authenticator)).Get(PathRejections, func(w http.ResponseWriter, request *http.Request) {
		rejections, err := service.Rejections(request.Context(), 0)
		if err != nil {
			httpjson.WriteError(w, err)
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, rejections)
	})
}

// refuse records a rejection and answers with its reason.
//
// The reason goes back to the caller as well as into the table. Antenne is the
// side that can fix a clock skew or a stale secret, and it should not need a
// query against Perception's database to find out which one it has.
//
// Everything is a 400 except a missing secret, which is Perception's own
// misconfiguration and deserves a 500 so it shows up on the right dashboard.
func refuse(w http.ResponseWriter, request *http.Request, service *Service, attempt delivery, reason string) {
	if recordable(reason) {
		service.Reject(request.Context(), reason, attempt.eventID, attempt.clientIP, attempt.body)
	}

	status := http.StatusBadRequest
	switch reason {
	case ReasonNoSecret:
		status = http.StatusInternalServerError
	case ReasonBadSignature, ReasonTimestampSkew:
		status = http.StatusUnauthorized
	case ReasonTooLarge:
		status = http.StatusRequestEntityTooLarge
	}
	httpjson.WriteJSON(w, status, RejectionResponse{Reason: reason})
}

// recordable reports whether a refusal says anything about the emitter.
//
// The log exists so a misconfigured sender is visible. A delivery refused
// because Perception has no secret configured describes Perception, not the
// sender — and while that is true it is true of every request, so recording it
// fills the table with rows that diagnose nothing. It is warned about at boot
// instead, which is where an operator can act on it.
func recordable(reason string) bool {
	return reason != ReasonNoSecret
}
