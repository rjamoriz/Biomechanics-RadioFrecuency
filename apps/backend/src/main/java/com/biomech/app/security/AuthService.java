package com.biomech.app.security;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class AuthService {

    private final AppUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AuthService(AppUserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new IllegalArgumentException("Email already registered");
        }

        var user = new AppUser();
        user.setEmail(request.email());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setDisplayName(request.displayName());
        user.setRole(request.role());
        userRepository.save(user);

        String token = jwtUtil.generateToken(user.getEmail(),
                Map.of("role", user.getRole().name()));
        return new AuthResponse(token, user.getEmail(), user.getDisplayName(),
                user.getRole().name());
    }

    public AuthResponse login(LoginRequest request) {
        var user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new IllegalArgumentException("Invalid credentials"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Invalid credentials");
        }

        if (!user.isActive()) {
            throw new IllegalArgumentException("Account is disabled");
        }

        String token = jwtUtil.generateToken(user.getEmail(),
                Map.of("role", user.getRole().name()));
        return new AuthResponse(token, user.getEmail(), user.getDisplayName(),
                user.getRole().name());
    }
}
