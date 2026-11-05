package com.creatorflow;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestControllerAdvice
public class ApiErrors {
    private static final Logger log=LoggerFactory.getLogger(ApiErrors.class);
    @ExceptionHandler(MediaValidator.InvalidMedia.class)
    ResponseEntity<Map<String,Object>> invalidMedia(MediaValidator.InvalidMedia e) {
        return ResponseEntity.status(e.status).body(Map.of("code",e.code,"error",e.getMessage()));
    }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String,Object>> invalid(MethodArgumentNotValidException e) {
        return ResponseEntity.badRequest().body(Map.of("error", "Invalid request: " + e.getFieldErrors().getFirst().getField()));
    }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String,Object>> malformed(HttpMessageNotReadableException e) {
        return ResponseEntity.badRequest().body(Map.of("error", "Malformed JSON request"));
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String,Object>> constraint(DataIntegrityViolationException e) {
        return ResponseEntity.badRequest().body(Map.of("error", "Database constraint violated"));
    }
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String,Object>> known(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode()).body(Map.of("error", e.getReason() == null ? "Request failed" : e.getReason()));
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String,Object>> unexpected(Exception e) {
        log.error("api_error type={}", e.getClass().getSimpleName(), e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "Internal server error"));
    }
}
