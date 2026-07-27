package com.evflow.backend.controller;

import com.evflow.backend.entity.Charger;
import com.evflow.backend.repository.ChargerRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/chargers")
public class ChargerController {

    private final ChargerRepository chargerRepository;

    public ChargerController(ChargerRepository chargerRepository) {
        this.chargerRepository = chargerRepository;
    }

    @GetMapping
    public List<Charger> list(
            @RequestParam double minLat,
            @RequestParam double minLng,
            @RequestParam double maxLat,
            @RequestParam double maxLng,
            @RequestParam(required = false) String connector) {
        return chargerRepository.findInBoundingBox(minLat, minLng, maxLat, maxLng, connector);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable Long id) {
        return chargerRepository.findById(id)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(404)
                        .body(Map.of("error", Map.of(
                                "code", "CHARGER_NOT_FOUND",
                                "message", "No charger with id " + id))));
    }
}
