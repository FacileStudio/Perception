package embeddings

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/FacileStudio/Perception/apps/api/schemas"

	troncerrors "github.com/FacileStudio/tronc/errors"
)

const (
	voyageURL     = "https://api.voyageai.com/v1/embeddings"
	httpTimeout   = 30 * time.Second
	batchSize     = 64
	maxInputRunes = 8000
	inputType     = "document"
)

type voyageRequest struct {
	Input     []string `json:"input"`
	Model     string   `json:"model"`
	InputType string   `json:"input_type"`
}

type voyageResponse struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// voyageClient talks to Voyage's embeddings endpoint. It is deliberately
// dumb: one call, one timeout, no retries — retry policy belongs to the
// worker, which owns the attempts counter and the backoff.
type voyageClient struct {
	apiKey string
	client *http.Client
}

func newVoyageClient(apiKey string) *voyageClient {
	return &voyageClient{apiKey: apiKey, client: &http.Client{Timeout: httpTimeout}}
}

func (client *voyageClient) embed(ctx context.Context, inputs []string) ([][]float32, error) {
	clipped := make([]string, len(inputs))
	for i, input := range inputs {
		runes := []rune(input)
		if len(runes) > maxInputRunes {
			runes = runes[:maxInputRunes]
		}
		clipped[i] = string(runes)
	}

	body, err := json.Marshal(voyageRequest{Input: clipped, Model: schemas.EmbeddingModel, InputType: inputType})
	if err != nil {
		return nil, fmt.Errorf("encode request: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, voyageURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+client.apiKey)
	request.Header.Set("Content-Type", "application/json")

	response, err := client.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("call voyage: %w", err)
	}
	defer response.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(response.Body, 64<<20))
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var decoded voyageResponse
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, troncerrors.New("voyage_response", fmt.Sprintf("voyage returned unparseable JSON with status %d", response.StatusCode), err)
	}
	if response.StatusCode != http.StatusOK || len(decoded.Data) != len(clipped) {
		message := "unknown error"
		if decoded.Error != nil {
			message = decoded.Error.Message
		}
		return nil, troncerrors.New("voyage_failed", fmt.Sprintf("voyage returned status %d with %d/%d embeddings: %s", response.StatusCode, len(decoded.Data), len(clipped), message), nil)
	}

	embeddings := make([][]float32, len(decoded.Data))
	for i, item := range decoded.Data {
		if len(item.Embedding) != schemas.EmbeddingDimensions {
			return nil, troncerrors.New("voyage_dimensions", fmt.Sprintf("voyage returned %d dimensions, want %d", len(item.Embedding), schemas.EmbeddingDimensions), nil)
		}
		embeddings[i] = item.Embedding
	}
	return embeddings, nil
}
