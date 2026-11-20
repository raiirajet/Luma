#!/usr/bin/env python3
"""Build the public-search gazetteer from local GeoNames export files."""

import argparse
import hashlib
import json
import re
from datetime import date
from pathlib import Path
from zipfile import ZipFile


COUNTRIES = ('AL', 'BA', 'BG', 'GR', 'HR', 'ME', 'MK', 'RO', 'RS', 'SI', 'TR', 'XK')
BASE_URL = 'https://download.geonames.org/export/dump/'
FILES = ('cities500.zip', 'admin1CodesASCII.txt', 'admin2Codes.txt')


def read_admin_names(path):
    names = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        key, name, *_ = line.split('\t')
        if key.partition('.')[0] in COUNTRIES:
            names[key] = name
    return names


def region_label(row, admin1, admin2):
    country, division, district = row[8], row[10], row[11]
    division_name = admin1.get(f'{country}.{division}', '')
    district_name = admin2.get(f'{country}.{division}.{district}', '')
    return ', '.join(dict.fromkeys(name for name in (district_name, division_name) if name))


def alternate_names(row):
    # Preserve relevant scripts and ignore short uppercase airport/station codes.
    names = [row[2], *row[3].split(',')]
    names = [name.strip() for name in names if 1 < len(name.strip()) <= 90]
    names = [name for name in names if not re.fullmatch(r'[A-Z]{2,3}', name)]
    return list(dict.fromkeys(name for name in names if name != row[1]))


def build(source_dir, snapshot_date):
    admin1 = read_admin_names(source_dir / FILES[1])
    admin2 = read_admin_names(source_dir / FILES[2])
    places = {country: [] for country in COUNTRIES}
    with ZipFile(source_dir / FILES[0]) as archive, archive.open('cities500.txt') as cities:
        for source_line in cities:
            row = source_line.decode('utf-8').rstrip('\r\n').split('\t')
            country = row[8]
            if country not in places or row[6] != 'P' or row[7] in ('PPLH', 'PPLQ', 'PPLW'):
                continue
            places[country].append([
                int(row[0]), row[1], region_label(row, admin1, admin2),
                round(float(row[4]), 5), round(float(row[5]), 5), int(row[14] or 0),
                alternate_names(row),
            ])

    for country, rows in places.items():
        if not rows:
            raise ValueError(f'No places for supported country {country}')
        rows.sort(key=lambda row: row[0])

    return {
        'schemaVersion': 1,
        'sourceDate': snapshot_date,
        'license': 'CC-BY-4.0',
        'sourceFiles': {BASE_URL + name: hashlib.sha256((source_dir / name).read_bytes()).hexdigest()
                        for name in FILES},
        'places': places,
    }


def write_catalog(content, destination):
    with destination.open('w', encoding='utf-8', newline='\n') as output:
        print('{', file=output)
        for key, value in content.items():
            if key != 'places':
                print(f'  {json.dumps(key)}:{json.dumps(value, ensure_ascii=False, separators=(",", ":"))},',
                      file=output)
        print('  "places":{', file=output)
        countries = list(content['places'].items())
        for country_index, (country, rows) in enumerate(countries):
            print(f'    "{country}":[', file=output)
            for row_index, row in enumerate(rows):
                suffix = ',' if row_index < len(rows) - 1 else ''
                row_json = json.dumps(row, ensure_ascii=False, separators=(',', ':'))
                print(f'      {row_json}{suffix}', file=output)
            suffix = ',' if country_index < len(countries) - 1 else ''
            print(f'    ]{suffix}', file=output)
        print('  }\n}', file=output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--source-date', type=date.fromisoformat, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).parents[1] / 'data' / 'listing-places.json')
    args = parser.parse_args()
    content = build(args.source_dir, args.source_date.isoformat())
    write_catalog(content, args.output)


if __name__ == '__main__':
    main()
