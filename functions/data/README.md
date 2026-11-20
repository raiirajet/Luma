# Limba locality catalog

The checked-in catalog uses data from GeoNames, licensed under Creative Commons Attribution 4.0. Limba filtered the dataset to populated places in its twelve existing markets, rounded coordinates to five decimal places, and joined district and region labels. The snapshot is dated 2026-11-20. [GeoNames](https://www.geonames.org/) · [Source export](https://download.geonames.org/export/dump/) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

The catalog includes places with more than 500 inhabitants and administrative seats included in the source. Radius searches use these locality coordinates. They measure straight-line distance between localities. Coverage of smaller places follows the source. Legacy city strings are resolved only when the normalized name or alias uniquely identifies a place within the supplied country in this catalog.

Each row contains the GeoNames ID, canonical name, administrative label, latitude, longitude, population, and aliases. The application forms a stable `gn-` identifier from each GeoNames ID. End users receive the identifier, name, country, and region in locality suggestions.

To reproduce this snapshot, use the three source files with the SHA-256 checksums in `listing-places.json`. GeoNames updates the public export daily. Keep the input files to reproduce an older snapshot, or update the source date and checksums when intentionally refreshing the catalog. Run the following command from the repository root.

```sh
python3 functions/ops/build-listing-places.py \
  --source-dir /path/to/geonames-export \
  --source-date 2026-11-20
```

The source directory must contain `cities500.zip`, `admin1CodesASCII.txt`, and `admin2Codes.txt`. The generator uses only the Python standard library and local files. The deployed callable reads the resulting file locally.
