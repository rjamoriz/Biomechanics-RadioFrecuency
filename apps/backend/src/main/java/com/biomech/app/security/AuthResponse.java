package com.biomech.app.security;

public record AuthResponse(String token, String email, String displayName, String role) {}
