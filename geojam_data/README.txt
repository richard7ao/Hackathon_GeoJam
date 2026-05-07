GeoJam 2026 — Data Pack
========================

Prepared by the data prep notebook on 2026-05-06 23:27.

Satellite imagery
-----------------
Source: Sentinel-2 L2A via Microsoft Planetary Computer
Early scenes (2019-07-23):
  S2B_MSIL2A_20190723T105629_R094_T31UCT_20201106T013939
  S2B_MSIL2A_20190723T105629_R094_T31UCS_20201005T184044
  S2B_MSIL2A_20190723T105629_R094_T30UYC_20201005T184045
  S2B_MSIL2A_20190723T105629_R094_T30UYB_20201005T184040
  S2B_MSIL2A_20190723T105629_R094_T30UXC_20201005T184035
  S2B_MSIL2A_20190723T105629_R094_T30UXB_20201005T184037
Late scenes (2024-07-29):
  S2B_MSIL2A_20240729T110619_R137_T31UCT_20240729T135102
  S2B_MSIL2A_20240729T110619_R137_T31UCS_20240729T135102
  S2B_MSIL2A_20240729T110619_R137_T30UYC_20240729T135102
  S2B_MSIL2A_20240729T110619_R137_T30UYB_20240729T135102
  S2B_MSIL2A_20240729T110619_R137_T30UXC_20240729T135102
  S2B_MSIL2A_20240729T110619_R137_T30UXB_20240729T135102
Resolution:  20 m/pixel
Raster shape: 2355 x 2856 pixels
CRS: EPSG:27700

Files:
  band_early_B02.npy .. B08.npy  — Sentinel-2 bands (float32, reflectance 0-1)
  band_late_B02.npy  .. B08.npy  — same for the later year
  ndvi_early.npy, ndvi_late.npy  — pre-computed NDVI (float32, range -1 to 1)
  raster_meta.json               — affine transform, CRS, shape, scene IDs

  Bands: B02=Blue, B03=Green, B04=Red, B08=NIR
  True colour composite: RGB = B04, B03, B02
  NDVI = (B08 - B04) / (B08 + B04)

MSOA data
---------
  msoa_base.gpkg  — 1011 London MSOAs with non-satellite features:
    MSOA21CD, MSOA21NM, population, area_km2, pop_density, dist_to_centre_km, dist_to_park_km

  msoa_full.gpkg  — same MSOAs with satellite-derived features added (escape hatch):
    Additional: mean_ndvi_early, mean_ndvi_late, mean_delta_ndvi, prop_greener, prop_greyer

Sources
-------
  Boundaries: ONS MSOA 2021 (BGC)
  Population: Census 2021 via NOMIS (TS001)
  Parks: OpenStreetMap (leisure=park)

Caveats
-------
  - Mosaiced from multiple Sentinel-2 tiles. Some edge MSOAs may still lack
    raster coverage (1 MSOAs had no data in this run).
  - NDVI from a single scene is affected by weather, phenology, and atmospheric
    conditions on that specific day. It is not a multi-temporal average.
  - Park data from OSM varies in completeness.
