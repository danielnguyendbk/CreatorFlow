package com.creatorflow;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
public class SecurityConfig {
    @Bean
    SecurityFilterChain security(HttpSecurity http, @Value("${creatorflow.api-token:}") String token,
            @Value("${CREATORFLOW_FRONTEND_ORIGIN:http://localhost:5173}") String origin) throws Exception {
        if (token.isBlank()) throw new IllegalStateException("CREATORFLOW_API_TOKEN is required");
        var cors = new CorsConfiguration();
        cors.setAllowedOrigins(List.of(origin));
        cors.setAllowedMethods(List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        http.csrf(c -> c.disable()).cors(c -> c.configurationSource(source))
            .authorizeHttpRequests(a -> a.requestMatchers("/actuator/health/**", "/v3/api-docs/**", "/swagger-ui/**").permitAll()
                .anyRequest().authenticated())
            .addFilterBefore(new OncePerRequestFilter() {
                @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                        throws ServletException, IOException {
                    String path = req.getRequestURI();
                    if (path.startsWith("/actuator/health") || path.startsWith("/v3/api-docs") || path.startsWith("/swagger-ui")) {
                        chain.doFilter(req, res); return;
                    }
                    byte[] expected = ("Bearer " + token).getBytes(StandardCharsets.UTF_8);
                    byte[] given = req.getHeader("Authorization") == null ? new byte[0] : req.getHeader("Authorization").getBytes(StandardCharsets.UTF_8);
                    if (!MessageDigest.isEqual(expected, given)) { res.sendError(401); return; }
                    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("local-user", null, List.of()));
                    chain.doFilter(req, res);
                }
            }, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
