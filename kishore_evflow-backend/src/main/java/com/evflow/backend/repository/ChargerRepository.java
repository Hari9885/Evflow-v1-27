package com.evflow.backend.repository;

import com.evflow.backend.entity.Charger;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ChargerRepository extends JpaRepository<Charger, Long> {

    @Query(value = """
            SELECT * FROM charger
            WHERE lat BETWEEN :minLat AND :maxLat
              AND lng BETWEEN :minLng AND :maxLng
              AND (:connector IS NULL OR :connector = ANY(connector_types))
            """, nativeQuery = true)
    List<Charger> findInBoundingBox(
            @Param("minLat") double minLat,
            @Param("minLng") double minLng,
            @Param("maxLat") double maxLat,
            @Param("maxLng") double maxLng,
            @Param("connector") String connector);
}
