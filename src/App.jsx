import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { feature as topojsonFeature } from "topojson-client";
import worldTopology from "world-atlas/countries-110m.json";

import "@fontsource-variable/inter-tight";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";

const PAPER = "#f4efe8";
const GLOBE = "#e9e3db";
const RED = "#d73321";
const DAY_MS = 24 * 60 * 60 * 1000;
const USGS_FEED =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

const FEATURED_EVENT = {
  id: "featured-south-pacific-rise",
  magnitude: 6.2,
  place: "South Pacific",
  longitude: -178.56,
  latitude: -20.19,
  depth: 10,
  time: Date.now() - 0.515 * DAY_MS,
  url: "https://earthquake.usgs.gov/earthquakes/map/",
  featured: true,
  source: "reference",
};

const FALLBACK_EVENTS = [
  FEATURED_EVENT,
  {
    id: "fallback-alaska",
    magnitude: 5.4,
    place: "Andreanof Islands, Alaska",
    longitude: -178.4,
    latitude: 51.32,
    depth: 44,
    time: Date.now() - 2.2 * 60 * 60 * 1000,
    source: "demo",
  },
  {
    id: "fallback-japan",
    magnitude: 4.9,
    place: "East of Honshu, Japan",
    longitude: 145.1,
    latitude: 38.48,
    depth: 29,
    time: Date.now() - 4.4 * 60 * 60 * 1000,
    source: "demo",
  },
  {
    id: "fallback-chile",
    magnitude: 5.1,
    place: "Offshore Atacama, Chile",
    longitude: -72.6,
    latitude: -27.1,
    depth: 34,
    time: Date.now() - 7.7 * 60 * 60 * 1000,
    source: "demo",
  },
  {
    id: "fallback-tonga",
    magnitude: 4.7,
    place: "Tonga Trench",
    longitude: -174.7,
    latitude: -20.9,
    depth: 81,
    time: Date.now() - 11.1 * 60 * 60 * 1000,
    source: "demo",
  },
  {
    id: "fallback-indonesia",
    magnitude: 5.3,
    place: "Banda Sea, Indonesia",
    longitude: 130.2,
    latitude: -6.4,
    depth: 119,
    time: Date.now() - 15.9 * 60 * 60 * 1000,
    source: "demo",
  },
  {
    id: "fallback-california",
    magnitude: 3.8,
    place: "Northern California",
    longitude: -122.7,
    latitude: 40.3,
    depth: 7,
    time: Date.now() - 20.6 * 60 * 60 * 1000,
    source: "demo",
  },
].sort((a, b) => b.time - a.time);

const WORLD = topojsonFeature(
  worldTopology,
  worldTopology.objects.countries,
);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLongitude(longitude) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function agePosition(event) {
  return clamp((Date.now() - event.time) / DAY_MS, 0, 1);
}

function displayTimelinePosition(event) {
  return agePosition(event);
}

function createGraticule() {
  const features = [];

  for (let longitude = -180; longitude <= 180; longitude += 15) {
    const coordinates = [];
    for (let latitude = -84; latitude <= 84; latitude += 2) {
      coordinates.push([longitude, latitude]);
    }
    features.push({
      type: "Feature",
      properties: { kind: "meridian", major: longitude % 45 === 0 },
      geometry: { type: "LineString", coordinates },
    });
  }

  for (let latitude = -75; latitude <= 75; latitude += 15) {
    const coordinates = [];
    for (let longitude = -180; longitude <= 180; longitude += 2) {
      coordinates.push([longitude, latitude]);
    }
    features.push({
      type: "Feature",
      properties: { kind: "parallel", major: latitude % 45 === 0 },
      geometry: { type: "LineString", coordinates },
    });
  }

  return { type: "FeatureCollection", features };
}

const GRATICULE = createGraticule();

function geometryLines(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
    return geometry.coordinates;
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flat();
  }
  return [];
}

const WORLD_LINES = WORLD.features.flatMap((feature) =>
  geometryLines(feature.geometry),
);
const GRATICULE_LINES = GRATICULE.features.map(
  (feature) => feature.geometry.coordinates,
);

function parseUsgs(payload) {
  const parsed = (payload?.features ?? [])
    .map((feature) => {
      const [longitude, latitude, depth = 0] =
        feature.geometry?.coordinates ?? [];
      const magnitude = Number(feature.properties?.mag);

      if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(magnitude)
      ) {
        return null;
      }

      return {
        id: String(feature.id),
        magnitude,
        place: feature.properties?.place || "Uncatalogued region",
        longitude,
        latitude,
        depth: Number(depth) || 0,
        time: Number(feature.properties?.time) || Date.now(),
        url: feature.properties?.url,
        source: "usgs",
      };
    })
    .filter(Boolean)
    .filter((event) => Date.now() - event.time <= DAY_MS)
    .sort((a, b) => b.time - a.time)
    .slice(0, 90);

  const supportingEvents = [
    ...parsed,
    ...FALLBACK_EVENTS.filter((event) => !event.featured),
  ].sort(
    (a, b) => b.time - a.time,
  );
  return [FEATURED_EVENT, ...supportingEvents].sort((a, b) => b.time - a.time);
}

function formatCoordinates(event) {
  const latitudeDirection = event.latitude >= 0 ? "N" : "S";
  const longitudeDirection = event.longitude >= 0 ? "E" : "W";
  return `${Math.abs(event.latitude).toFixed(2)}° ${latitudeDirection}  /  ${Math.abs(
    event.longitude,
  ).toFixed(2)}° ${longitudeDirection}`;
}

function formatUtc(time) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(time);
}

function formatAge(time) {
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `${minutes || 1} MIN AGO`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} HRS AGO`;
}

function MagnitudeDisplay({ magnitude, scrubbing }) {
  const value = Number(magnitude).toFixed(1);

  return (
    <div
      className={`magnitude${scrubbing ? " magnitude--scrubbing" : ""}`}
      aria-label={`Magnitude ${value}`}
    >
      <span className="magnitude__ghost magnitude__ghost--far" aria-hidden="true">
        {value}
      </span>
      <span className="magnitude__ghost magnitude__ghost--near" aria-hidden="true">
        {value}
      </span>
      <span className="magnitude__slice magnitude__slice--top" aria-hidden="true">
        {value}
      </span>
      <span className="magnitude__slice magnitude__slice--bottom" aria-hidden="true">
        {value}
      </span>
    </div>
  );
}

function Timeline({ events, position, onScrub, onScrubState }) {
  const railRef = useRef(null);
  const draggingRef = useRef(false);
  const tickCount = Math.min(24, events.length);
  const tickEvents = Array.from({ length: tickCount }, (_, index) => {
    if (tickCount <= 1) return events[0];
    return events[Math.round((index * (events.length - 1)) / (tickCount - 1))];
  }).filter(Boolean);

  const updateFromPointer = useCallback(
    (clientX, clientY) => {
      const bounds = railRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const isHorizontal = bounds.width > bounds.height;
      const nextPosition = isHorizontal
        ? (clientX - bounds.left) / bounds.width
        : (clientY - bounds.top) / bounds.height;
      onScrub(clamp(nextPosition, 0, 1));
    },
    [onScrub],
  );

  const beginDrag = (event) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onScrubState(true);
    updateFromPointer(event.clientX, event.clientY);
  };

  const moveDrag = (event) => {
    if (draggingRef.current) updateFromPointer(event.clientX, event.clientY);
  };

  const endDrag = (event) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    updateFromPointer(event.clientX, event.clientY);
    onScrubState(false);
  };

  const onKeyDown = (event) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") onScrub(0);
    if (event.key === "End") onScrub(1);
    if (event.key === "ArrowUp") onScrub(clamp(position - 0.025, 0, 1));
    if (event.key === "ArrowDown") onScrub(clamp(position + 0.025, 0, 1));
  };

  return (
    <div className="timeline">
      <span className="timeline__label timeline__label--start">00:00</span>
      <div
        ref={railRef}
        className="timeline__rail"
        style={{ "--timeline-position": position }}
        role="slider"
        tabIndex="0"
        aria-label="Earthquakes from the last 24 hours"
        aria-valuemin="0"
        aria-valuemax="24"
        aria-valuenow={Math.round(position * 24)}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <span className="timeline__line" aria-hidden="true" />
        <span
          className="timeline__active"
          style={{ top: `${position * 100}%` }}
          aria-hidden="true"
        />
        {tickEvents.map((event) => (
          <span
            key={event.id}
            className={`timeline__tick${
              Math.abs(displayTimelinePosition(event) - position) < 0.018
                ? " timeline__tick--active"
                : ""
            }`}
            style={{
              top: `${displayTimelinePosition(event) * 100}%`,
              "--tick-position": displayTimelinePosition(event),
            }}
            aria-hidden="true"
          />
        ))}
        <span
          className="timeline__knob"
          style={{ top: `${position * 100}%` }}
          aria-hidden="true"
        />
      </div>
      <span className="timeline__label timeline__label--end">24:00</span>
    </div>
  );
}

function projectGlobePoint(longitude, latitude, view, width, height) {
  const radians = Math.PI / 180;
  const lambda = (longitude - view.longitude) * radians;
  const phi = latitude * radians;
  const phi0 = view.latitude * radians;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinPhi0 = Math.sin(phi0);
  const cosPhi0 = Math.cos(phi0);
  const visibility = sinPhi0 * sinPhi + cosPhi0 * cosPhi * Math.cos(lambda);
  const radius = Math.min(width, height) * 0.496 * view.zoom;

  return {
    x: width / 2 + radius * cosPhi * Math.sin(lambda),
    y:
      height / 2 -
      radius *
        (cosPhi0 * sinPhi - sinPhi0 * cosPhi * Math.cos(lambda)),
    visible: visibility >= -0.012,
  };
}

function traceProjectedLine(context, coordinates, project) {
  let drawing = false;
  for (let index = 0; index < coordinates.length; index += 1) {
    const [longitude, latitude] = coordinates[index];
    const point = project(longitude, latitude);
    if (!point.visible) {
      drawing = false;
      continue;
    }
    if (!drawing) {
      context.moveTo(point.x, point.y);
      drawing = true;
    } else {
      context.lineTo(point.x, point.y);
    }
  }
}

function GlobeCanvas({
  events,
  selected,
  onSelect,
  onReady,
  onCallout,
  reducedMotion,
}) {
  const canvasRef = useRef(null);
  const eventsDataRef = useRef(events);
  const selectedDataRef = useRef(selected);
  const onSelectRef = useRef(onSelect);
  const onCalloutRef = useRef(onCallout);
  const drawRef = useRef(null);
  const animateToRef = useRef(null);
  const cameraAnimationRef = useRef(null);
  const inertiaAnimationRef = useRef(null);
  const hoveredIdRef = useRef(null);
  const projectedEventsRef = useRef([]);
  const viewRef = useRef({
    longitude: normalizeLongitude(selected.longitude + 13),
    latitude: clamp(selected.latitude - 10, -72, 70),
    zoom: 1,
  });

  useEffect(() => {
    eventsDataRef.current = events;
    drawRef.current?.();
  }, [events]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onCalloutRef.current = onCallout;
  }, [onCallout]);

  useEffect(() => {
    selectedDataRef.current = selected;
    animateToRef.current?.(selected, reducedMotion);
  }, [reducedMotion, selected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d", { alpha: true });
    let framePending = false;
    let disposed = false;
    let cssWidth = 1;
    let cssHeight = 1;
    let autoRotateFrame = null;
    let autoRotateResumeAt = performance.now() + 1800;
    let autoRotateLastTime = performance.now();
    let autoRotateAccumulated = 0;

    const pauseAutoRotate = (delay = 2200) => {
      const now = performance.now();
      autoRotateResumeAt = now + delay;
      autoRotateLastTime = now;
      autoRotateAccumulated = 0;
    };

    const project = (longitude, latitude) =>
      projectGlobePoint(
        longitude,
        latitude,
        viewRef.current,
        cssWidth,
        cssHeight,
      );

    const updateCalloutPosition = () => {
      const event = selectedDataRef.current;
      const point = project(event.longitude, event.latitude);
      const bounds = canvas.getBoundingClientRect();
      const screenX = bounds.left + point.x;
      const screenY = bounds.top + point.y;
      onCalloutRef.current({
        x: screenX,
        y: screenY,
        visible:
          point.visible &&
          screenX > -90 &&
          screenX < window.innerWidth + 90 &&
          screenY > -90 &&
          screenY < window.innerHeight + 90,
      });
    };

    const draw = () => {
      framePending = false;
      if (disposed) return;

      context.clearRect(0, 0, cssWidth, cssHeight);
      context.fillStyle = GLOBE;
      context.fillRect(0, 0, cssWidth, cssHeight);

      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";

      context.beginPath();
      for (const coordinates of GRATICULE_LINES) {
        traceProjectedLine(context, coordinates, project);
      }
      context.strokeStyle = "rgba(92, 88, 83, 0.22)";
      context.lineWidth = 0.8;
      context.stroke();

      context.beginPath();
      for (const coordinates of WORLD_LINES) {
        const projected = coordinates.map(([longitude, latitude]) =>
          project(longitude, latitude),
        );
        if (projected.length > 2 && projected.every((point) => point.visible)) {
          context.moveTo(projected[0].x, projected[0].y);
          for (let index = 1; index < projected.length; index += 1) {
            context.lineTo(projected[index].x, projected[index].y);
          }
          context.closePath();
        }
      }
      context.fillStyle = "rgba(247, 242, 235, 0.48)";
      context.fill("evenodd");

      context.beginPath();
      for (const coordinates of WORLD_LINES) {
        traceProjectedLine(context, coordinates, project);
      }
      context.strokeStyle = "rgba(77, 73, 69, 0.14)";
      context.lineWidth = 4.2;
      context.stroke();

      context.beginPath();
      for (const coordinates of WORLD_LINES) {
        traceProjectedLine(context, coordinates, project);
      }
      context.strokeStyle = "rgba(57, 54, 51, 0.62)";
      context.lineWidth = 0.82;
      context.stroke();

      projectedEventsRef.current = [];
      for (const event of eventsDataRef.current) {
        const point = project(event.longitude, event.latitude);
        if (!point.visible) continue;
        projectedEventsRef.current.push({
          id: event.id,
          event,
          x: point.x,
          y: point.y,
        });

        // Skip the picked quake here. Its dot and rings live in the callout so
        // they dont drift apart while the globe is moving.
        if (event.id === selectedDataRef.current.id) continue;

        const isHovered = hoveredIdRef.current === event.id;
        const radius = clamp(1.4 + Math.max(0, event.magnitude - 2.5) * 0.58, 1.4, 5.4);
        if (isHovered) {
          context.beginPath();
          context.arc(point.x, point.y, radius + 9, 0, Math.PI * 2);
          context.fillStyle = "rgba(215, 51, 33, 0.12)";
          context.fill();
        }
        context.beginPath();
        context.arc(point.x, point.y, isHovered ? radius * 1.65 : radius, 0, Math.PI * 2);
        context.fillStyle = RED;
        context.fill();
        context.lineWidth = 0.7;
        context.strokeStyle = PAPER;
        context.stroke();
      }

      context.restore();
      updateCalloutPosition();
    };

    const scheduleDraw = () => {
      if (framePending || disposed) return;
      framePending = true;
      window.requestAnimationFrame(draw);
    };
    drawRef.current = scheduleDraw;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssWidth = Math.max(1, bounds.width);
      cssHeight = Math.max(1, bounds.height);
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      scheduleDraw();
    };

    animateToRef.current = (event, immediate = false) => {
      if (!event) return;
      window.cancelAnimationFrame(cameraAnimationRef.current);
      window.cancelAnimationFrame(inertiaAnimationRef.current);
      cameraAnimationRef.current = null;
      inertiaAnimationRef.current = null;
      pauseAutoRotate(immediate ? 1800 : 2600);
      const bounds = canvas.getBoundingClientRect();
      const radius = Math.min(bounds.width, bounds.height) * 0.496 * viewRef.current.zoom;
      const desiredScreenX = window.innerWidth * (window.innerWidth <= 650 ? 0.72 : 0.71);
      const desiredOffset = clamp(
        (desiredScreenX - (bounds.left + bounds.width / 2)) / radius,
        -0.68,
        0.68,
      );
      const longitudeOffset =
        (-Math.asin(desiredOffset) * 180) / Math.PI;
      const targetLongitude = normalizeLongitude(
        event.longitude + longitudeOffset,
      );
      const targetLatitude = clamp(event.latitude - 10, -72, 70);
      const fromLongitude = viewRef.current.longitude;
      const longitudeDelta = normalizeLongitude(targetLongitude - fromLongitude);
      const fromLatitude = viewRef.current.latitude;

      if (immediate) {
        viewRef.current.longitude = targetLongitude;
        viewRef.current.latitude = targetLatitude;
        scheduleDraw();
        return;
      }

      const startedAt = performance.now();
      const animateCamera = (time) => {
        const progress = clamp((time - startedAt) / 1050, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        viewRef.current.longitude = normalizeLongitude(
          fromLongitude + longitudeDelta * eased,
        );
        viewRef.current.latitude =
          fromLatitude + (targetLatitude - fromLatitude) * eased;
        scheduleDraw();
        if (progress < 1) {
          cameraAnimationRef.current = window.requestAnimationFrame(animateCamera);
        } else {
          cameraAnimationRef.current = null;
          pauseAutoRotate(1400);
        }
      };
      cameraAnimationRef.current = window.requestAnimationFrame(animateCamera);
    };

    const drag = {
      active: false,
      moved: false,
      lastX: 0,
      lastY: 0,
      lastTime: 0,
      velocityLongitude: 0,
      velocityLatitude: 0,
    };

    const findHovered = (x, y) => {
      let nearest = null;
      for (const candidate of projectedEventsRef.current) {
        const distance = Math.hypot(candidate.x - x, candidate.y - y);
        if (distance <= 15 && (!nearest || distance < nearest.distance)) {
          nearest = { ...candidate, distance };
        }
      }
      return nearest;
    };

    const pointerPosition = (event) => {
      const bounds = canvas.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };

    const onPointerDown = (event) => {
      event.preventDefault();
      window.cancelAnimationFrame(cameraAnimationRef.current);
      window.cancelAnimationFrame(inertiaAnimationRef.current);
      cameraAnimationRef.current = null;
      inertiaAnimationRef.current = null;
      pauseAutoRotate();
      const point = pointerPosition(event);
      drag.active = true;
      drag.moved = false;
      drag.lastX = point.x;
      drag.lastY = point.y;
      drag.lastTime = performance.now();
      drag.velocityLongitude = 0;
      drag.velocityLatitude = 0;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("globe-map--dragging");
    };

    const onPointerMove = (event) => {
      const point = pointerPosition(event);
      if (drag.active) {
        const now = performance.now();
        const deltaX = point.x - drag.lastX;
        const deltaY = point.y - drag.lastY;
        const elapsed = Math.max(8, now - drag.lastTime);
        const sensitivity = 96 / (Math.min(cssWidth, cssHeight) * viewRef.current.zoom);
        if (Math.abs(deltaX) + Math.abs(deltaY) > 1) drag.moved = true;
        const longitudeChange = -deltaX * sensitivity;
        const latitudeChange = deltaY * sensitivity * 0.78;
        viewRef.current.longitude = normalizeLongitude(
          viewRef.current.longitude + longitudeChange,
        );
        viewRef.current.latitude = clamp(
          viewRef.current.latitude + latitudeChange,
          -76,
          76,
        );
        drag.velocityLongitude = longitudeChange / elapsed;
        drag.velocityLatitude = latitudeChange / elapsed;
        drag.lastX = point.x;
        drag.lastY = point.y;
        drag.lastTime = now;
        pauseAutoRotate();
        scheduleDraw();
        return;
      }

      const nearest = findHovered(point.x, point.y);
      const nextId = nearest?.id ?? null;
      if (nextId !== hoveredIdRef.current) {
        hoveredIdRef.current = nextId;
        canvas.style.cursor = nextId ? "pointer" : "grab";
        scheduleDraw();
      }
    };

    const onPointerUp = (event) => {
      if (!drag.active) return;
      drag.active = false;
      canvas.classList.remove("globe-map--dragging");
      canvas.releasePointerCapture?.(event.pointerId);
      const point = pointerPosition(event);

      if (!drag.moved) {
        const nearest = findHovered(point.x, point.y);
        if (nearest) onSelectRef.current(nearest.event);
        return;
      }

      if (reducedMotion) return;
      let velocityLongitude = drag.velocityLongitude * 16;
      let velocityLatitude = drag.velocityLatitude * 16;
      const coast = () => {
        velocityLongitude *= 0.91;
        velocityLatitude *= 0.91;
        viewRef.current.longitude = normalizeLongitude(
          viewRef.current.longitude + velocityLongitude,
        );
        viewRef.current.latitude = clamp(
          viewRef.current.latitude + velocityLatitude,
          -76,
          76,
        );
        scheduleDraw();
        if (Math.abs(velocityLongitude) + Math.abs(velocityLatitude) > 0.012) {
          inertiaAnimationRef.current = window.requestAnimationFrame(coast);
        } else {
          inertiaAnimationRef.current = null;
          pauseAutoRotate(1400);
        }
      };
      inertiaAnimationRef.current = window.requestAnimationFrame(coast);
    };

    const onWheel = (event) => {
      event.preventDefault();
      pauseAutoRotate();
      viewRef.current.zoom = clamp(
        viewRef.current.zoom * Math.exp(-event.deltaY * 0.00055),
        0.88,
        1.2,
      );
      scheduleDraw();
    };

    const onKeyDown = (event) => {
      const step = event.shiftKey ? 10 : 4;
      let handled = true;

      if (event.key === "ArrowLeft") {
        viewRef.current.longitude = normalizeLongitude(
          viewRef.current.longitude - step,
        );
      } else if (event.key === "ArrowRight") {
        viewRef.current.longitude = normalizeLongitude(
          viewRef.current.longitude + step,
        );
      } else if (event.key === "ArrowUp") {
        viewRef.current.latitude = clamp(
          viewRef.current.latitude + step,
          -76,
          76,
        );
      } else if (event.key === "ArrowDown") {
        viewRef.current.latitude = clamp(
          viewRef.current.latitude - step,
          -76,
          76,
        );
      } else if (["+", "="].includes(event.key)) {
        viewRef.current.zoom = clamp(viewRef.current.zoom * 1.08, 0.88, 1.2);
      } else if (["-", "_"].includes(event.key)) {
        viewRef.current.zoom = clamp(viewRef.current.zoom / 1.08, 0.88, 1.2);
      } else if (event.key === "Home") {
        animateToRef.current(selectedDataRef.current, reducedMotion);
      } else if (event.key === "Enter") {
        const nearest = projectedEventsRef.current.reduce((best, candidate) => {
          const distance = Math.hypot(
            candidate.x - cssWidth / 2,
            candidate.y - cssHeight / 2,
          );
          return !best || distance < best.distance
            ? { ...candidate, distance }
            : best;
        }, null);
        if (nearest) onSelectRef.current(nearest.event);
      } else {
        handled = false;
      }

      if (handled) {
        event.preventDefault();
        pauseAutoRotate();
        scheduleDraw();
      }
    };

    const autoRotate = (time) => {
      const elapsed = clamp(time - autoRotateLastTime, 0, 64);
      autoRotateLastTime = time;

      if (
        !reducedMotion &&
        !drag.active &&
        cameraAnimationRef.current === null &&
        inertiaAnimationRef.current === null &&
        time >= autoRotateResumeAt
      ) {
        autoRotateAccumulated += elapsed;
        if (autoRotateAccumulated >= 1000 / 30) {
          viewRef.current.longitude = normalizeLongitude(
            viewRef.current.longitude - autoRotateAccumulated * 0.00035,
          );
          autoRotateAccumulated = 0;
          scheduleDraw();
        }
      } else {
        autoRotateAccumulated = 0;
      }

      autoRotateFrame = window.requestAnimationFrame(autoRotate);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKeyDown);

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    animateToRef.current(selectedDataRef.current, true);
    autoRotateFrame = window.requestAnimationFrame(autoRotate);
    onReady(true);

    return () => {
      disposed = true;
      observer.disconnect();
      window.cancelAnimationFrame(autoRotateFrame);
      window.cancelAnimationFrame(cameraAnimationRef.current);
      window.cancelAnimationFrame(inertiaAnimationRef.current);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKeyDown);
    };
  }, [onReady, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="globe-map"
      role="application"
      tabIndex="0"
      aria-label="Interactive earthquake globe"
      aria-describedby="globe-instructions"
    />
  );
}

export function App() {
  const [events, setEvents] = useState(FALLBACK_EVENTS);
  const [selectedId, setSelectedId] = useState(FEATURED_EVENT.id);
  const [timelinePosition, setTimelinePosition] = useState(
    displayTimelinePosition(FEATURED_EVENT),
  );
  const [scrubbing, setScrubbing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [callout, setCallout] = useState({ x: 0, y: 0, visible: false });
  const [dataMode, setDataMode] = useState("CONNECTING");
  const [reducedMotion, setReducedMotion] = useState(false);

  const selected = useMemo(
    () => events.find((event) => event.id === selectedId) ?? events[0],
    [events, selectedId],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5500);

    fetch(USGS_FEED, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("USGS feed unavailable");
        return response.json();
      })
      .then((payload) => {
        const nextEvents = parseUsgs(payload);
        setEvents(nextEvents.length > 1 ? nextEvents : FALLBACK_EVENTS);
        setDataMode("LIVE / USGS");
      })
      .catch(() => {
        setEvents(FALLBACK_EVENTS);
        setDataMode("DEMO / CACHED");
      })
      .finally(() => window.clearTimeout(timeoutId));

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!scrubbing && selected) {
      setTimelinePosition(displayTimelinePosition(selected));
    }
  }, [scrubbing, selected]);

  const selectEvent = useCallback((event) => {
    setSelectedId(event.id);
    setTimelinePosition(displayTimelinePosition(event));
  }, []);

  const scrubTimeline = useCallback(
    (position) => {
      setTimelinePosition(position);
      const nearest = events.reduce((best, event) => {
        const distance = Math.abs(displayTimelinePosition(event) - position);
        if (!best || distance < best.distance) return { event, distance };
        return best;
      }, null);
      if (nearest?.event && nearest.event.id !== selectedId) {
        setSelectedId(nearest.event.id);
      }
    },
    [events, selectedId],
  );

  const selectRelative = (direction) => {
    const currentIndex = events.findIndex((event) => event.id === selected.id);
    const nextIndex = clamp(currentIndex + direction, 0, events.length - 1);
    selectEvent(events[nextIndex]);
  };

  const selectedIndex = events.findIndex((event) => event.id === selected.id);

  return (
    <main className={`quake-app${mapReady ? " quake-app--ready" : ""}`}>
      <div className="globe-wrap">
        <GlobeCanvas
          events={events}
          selected={selected}
          onSelect={selectEvent}
          onReady={setMapReady}
          onCallout={setCallout}
          reducedMotion={reducedMotion}
        />
      </div>

      <div className="paper-grain" aria-hidden="true" />

      <header className="masthead">
        <a className="wordmark" href="#live" aria-label="Shakespot home">
          SHAKESPOT
        </a>
        <span className="live-state">
          <span className="live-state__dot" aria-hidden="true" />
          LIVE
        </span>
      </header>

      <section className="event-readout" id="live" aria-live="polite">
        <MagnitudeDisplay
          key={selected.id}
          magnitude={selected.magnitude}
          scrubbing={scrubbing}
        />
        <div className="event-readout__meta">
          <span className="event-readout__place">{selected.place}</span>
          <span className="event-readout__time">
            {formatUtc(selected.time)} UTC&nbsp;&nbsp;/&nbsp;&nbsp;{formatAge(selected.time)}
          </span>
          <span className="event-readout__depth">
            DEPTH {Math.round(selected.depth)} KM&nbsp;&nbsp;·&nbsp;&nbsp;
            {selected.source === "usgs"
              ? dataMode
              : selected.featured
                ? "REFERENCE / DEMO"
                : "CURATED / DEMO"}
          </span>
        </div>
      </section>

      <Timeline
        events={events}
        position={timelinePosition}
        onScrub={scrubTimeline}
        onScrubState={setScrubbing}
      />

      <div
        key={selected.id}
        className={`quake-callout${callout.visible ? " quake-callout--visible" : ""}`}
        style={{ left: callout.x, top: callout.y }}
        aria-hidden={!callout.visible}
      >
        <span className="quake-callout__rings" aria-hidden="true">
          {Array.from({ length: 13 }, (_, index) => (
            <span key={index} style={{ "--ring-index": index }} />
          ))}
        </span>
        <span className="quake-callout__core" aria-hidden="true" />
        <span className="quake-callout__line" aria-hidden="true" />
        <span className="quake-callout__terminal" aria-hidden="true" />
        <span className="quake-callout__coordinates">
          {formatCoordinates(selected)}
        </span>
      </div>

      <nav className="event-nav" aria-label="Browse earthquake events">
        <button
          type="button"
          className="event-nav__button"
          onClick={() => selectRelative(-1)}
          aria-label="Newer earthquake"
          disabled={selectedIndex <= 0}
        >
          <ArrowLeft weight="regular" aria-hidden="true" />
        </button>
        <span>DRAG TIME</span>
        <button
          type="button"
          className="event-nav__button"
          onClick={() => selectRelative(1)}
          aria-label="Older earthquake"
          disabled={selectedIndex >= events.length - 1}
        >
          <ArrowRight weight="regular" aria-hidden="true" />
        </button>
      </nav>

      <span className="map-hint" id="globe-instructions">
        DRAG / ARROWS TO ROTATE&nbsp;&nbsp;·&nbsp;&nbsp;SCROLL / +− TO ZOOM&nbsp;&nbsp;·&nbsp;&nbsp;ENTER TO SELECT
      </span>
    </main>
  );
}
