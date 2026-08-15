package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/FacileStudio/tronc/errors"
	"github.com/FacileStudio/tronc/httpjson"
)

type visitor struct {
	tokens     float64
	lastSeen   time.Time
	maxTokens  float64
	refillRate float64
}

func (v *visitor) allow() bool {
	now := time.Now()
	elapsed := now.Sub(v.lastSeen).Seconds()
	v.lastSeen = now
	v.tokens += elapsed * v.refillRate
	if v.tokens > v.maxTokens {
		v.tokens = v.maxTokens
	}
	if v.tokens < 1 {
		return false
	}
	v.tokens--
	return true
}

// RateLimiter is an in-memory token-bucket limiter keyed by remote address.
type RateLimiter struct {
	mu         sync.Mutex
	visitors   map[string]*visitor
	maxTokens  float64
	refillRate float64
}

// NewRateLimiter builds a limiter admitting maxPerWindow requests per window
// per address and starts its visitor-cleanup loop.
func NewRateLimiter(maxPerWindow int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors:   make(map[string]*visitor),
		maxTokens:  float64(maxPerWindow),
		refillRate: float64(maxPerWindow) / window.Seconds(),
	}
	go rl.cleanup()
	return rl
}

func (rl *RateLimiter) cleanup() {
	for {
		time.Sleep(5 * time.Minute)
		rl.mu.Lock()
		for ip, v := range rl.visitors {
			if time.Since(v.lastSeen) > 10*time.Minute {
				delete(rl.visitors, ip)
			}
		}
		rl.mu.Unlock()
	}
}

func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, exists := rl.visitors[ip]
	if !exists {
		rl.visitors[ip] = &visitor{
			tokens:     rl.maxTokens - 1,
			lastSeen:   time.Now(),
			maxTokens:  rl.maxTokens,
			refillRate: rl.refillRate,
		}
		return true
	}
	return v.allow()
}

// RateLimit keys on RemoteAddr, never on a forwarded header: a header a client
// controls would let the caller reset its own bucket by inventing an address.
func RateLimit(limiter *RateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
			ip, _, _ := net.SplitHostPort(request.RemoteAddr)
			if ip == "" {
				ip = request.RemoteAddr
			}

			if !limiter.Allow(ip) {
				w.Header().Set("Retry-After", "60")
				httpjson.WriteError(w, errors.RateLimited("too many requests, try again later"))
				return
			}

			next.ServeHTTP(w, request)
		})
	}
}
