# Atlas Pro: connecting bookings

Atlas Pro shows how full a saved building is, live: the building in 3D floor by
floor, every room, arrivals and departures, and the next 14 nights. It needs
reservations (and, optionally, live room status) from wherever the building is
managed: a property-management system (PMS), a CRM, or a spreadsheet.

Atlas runs entirely in the browser, so it never holds a CRM's secret API keys.
There are three ways in:

| Way in | Good for | Setup |
| --- | --- | --- |
| **Demo feed** | Trying it | One tap. A simulated hotel on the saved building. |
| **Reservations export** | Any system, today | Export bookings as CSV and import the file. |
| **Live link** | Real time | A URL Atlas polls every 30 seconds (see below). |

## 1. Reservations export (CSV)

Any spreadsheet or export with a header row. Atlas recognises these columns
(case-insensitive, English or Spanish); only arrival and departure are required:

| Meaning | Header names recognised |
| --- | --- |
| Room | room, room no, room number, unit, habitación, hab, cuarto, apartment, space |
| Arrival | check-in, checkin, arrival, start, from, llegada, entrada, fecha de llegada |
| Departure | check-out, checkout, departure, end, to, until, salida, fecha de salida |
| Guests | guests, pax, adults, people, occupants, huéspedes, personas, adultos |
| Status | status, state, estado (rows marked cancelled / no-show / anulada are skipped) |

Dates may be `2025-06-01`, `2025-06-01 15:00`, `01/06/2025` (day first) or
`6/13/2025` (US, when the day is over 12). Date-only arrivals count from 15:00
and departures until 11:00. Floors come from room numbers (`203` is floor 2).
Commas, semicolons and tabs all work. **Guest names are never read.**

## 2. Live link

Any `https://` URL that returns either the CSV above, or JSON in this shape,
with CORS allowing the Atlas site to read it:

```json
{
  "rooms": [
    { "id": "101", "floor": 1, "capacity": 2 },
    { "id": "102", "floor": 1 }
  ],
  "reservations": [
    { "room": "101", "checkIn": "2025-06-01", "checkOut": "2025-06-03", "guests": 2, "status": "confirmed" },
    { "room": "102", "start": "2025-06-02T14:00:00-04:00", "end": "2025-06-04T11:00:00-04:00" }
  ],
  "status": [
    { "room": "102", "status": "cleaning" },
    { "room": "104", "status": "out of order" }
  ]
}
```

- `rooms` is optional (rooms are also taken from bookings and status); `floor`
  defaults to the room number's hundreds.
- `reservations` fields: `room`, `start`/`checkIn`/`arrival`,
  `end`/`checkOut`/`departure`, `guests`/`pax`, `status`. Times can be ISO
  strings, epoch seconds or epoch milliseconds.
- `status` is for live overrides newer than the bookings (housekeeping,
  maintenance): `occupied`, `vacant`, `cleaning`/`dirty`, `out of order`/
  `maintenance`, and Spanish equivalents (`ocupada`, `libre`, `limpieza`,
  `mantenimiento`).

### Without writing code: a Google Sheet

1. Keep reservations in a Google Sheet (many CRMs and booking systems can sync
   to one through Zapier, Make or their own integrations).
2. *File → Share → Publish to the web*, choose the sheet and *CSV*, and copy the link.
3. Paste it into *Connect a live link* in Atlas Pro.

### A connector service

For a direct connection to a PMS or CRM API (Cloudbeds, Mews, Little Hotelier,
HubSpot, Salesforce…), run a small service that holds the vendor's API key,
calls its API on a schedule or on its webhooks, and serves the JSON above with:

```
Access-Control-Allow-Origin: https://<your Atlas site>
Cache-Control: no-store
```

Put an unguessable token in the URL path (or keep the service on a private
network) so the occupancy feed isn't public, and return only what Atlas needs:
room numbers, dates, guest counts and room status. No names, emails or
payment details.

## Cameras

Cameras placed in My Places can be connected in Atlas Pro to count people,
vehicles and bikes live. Detection runs on the viewer's device with a small
TensorFlow.js model (COCO-SSD, loaded only when a camera is connected); video
never leaves the browser, and it only recognises kinds of things, never who
someone is. Draw a counting line on the picture (e.g. across a doorway) for
entries and exits.

A camera can be connected by:

- **A snapshot link** (a URL that returns the current still image, which most
  IP cameras and NVRs offer) or **a video link** (MP4/WebM, or HLS in Safari).
  The camera or a relay must send `Access-Control-Allow-Origin` for Atlas to
  analyse the pixels; without it the feed can be shown but not counted.
  RTSP streams need a relay that converts them for the web (e.g. go2rtc or
  MediaMTX on the local network).
- **This device's camera**, useful for trying it out.
- **A video file**, to run the counts on recorded footage.

Check local rules on video recording and signage before pointing cameras at
public spaces; Atlas stores no frames, only counts in memory.
