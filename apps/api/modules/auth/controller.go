package auth

import (
	"context"
	"strings"

	"github.com/FacileStudio/Perception/apps/api/internal/identity"
	"github.com/FacileStudio/tronc/errors"
)

type Controller struct {
	service *Service
}

func newController(service *Service) *Controller {
	return &Controller{service: service}
}

func (controller *Controller) register(ctx context.Context, req *RegisterRequest) (*AuthResponse, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" || !strings.Contains(email, "@") {
		return nil, errors.Invalid("invalid email")
	}
	if len(req.Password) < 8 {
		return nil, errors.Invalid("password must be at least 8 characters")
	}

	userID, token, err := controller.service.registerUser(ctx, email, req.Password, strings.TrimSpace(req.Name))
	if err != nil {
		return nil, err
	}
	return &AuthResponse{UserID: userID, Token: token}, nil
}

func (controller *Controller) login(ctx context.Context, req *LoginRequest) (*AuthResponse, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" || req.Password == "" {
		return nil, errors.Invalid("email and password required")
	}

	userID, token, err := controller.service.loginUser(ctx, email, req.Password)
	if err != nil {
		return nil, err
	}
	return &AuthResponse{UserID: userID, Token: token}, nil
}

func (controller *Controller) me(ctx context.Context) (*MeResponse, error) {
	caller, ok := identity.FromContext(ctx)
	if !ok {
		return nil, errors.Unauthorized("missing auth")
	}
	return &MeResponse{ID: caller.UserID, Email: caller.Email, Name: caller.Name}, nil
}
