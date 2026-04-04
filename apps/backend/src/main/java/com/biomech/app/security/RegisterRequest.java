package com.biomech.app.security;

import com.biomech.app.common.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank @Email String email,
        @NotBlank @Size(min = 6, max = 128) String password,
        @NotBlank String displayName,
        @NotNull UserRole role
) {}
