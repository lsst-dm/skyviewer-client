#!/usr/bin/env python
"""Dump a skymap's tract boundaries to the JSON the viewer overlays.

Run this where the stack and a butler repo are available (USDF); the output
is a static asset checked in under `public/skymaps/`. The viewer makes no
claim that a given survey was built on the skymap being overlaid -- these
are offered as selectable grids, so adding another skymap is just another
run of this script.

    python scripts/dump-skymap-tracts.py \
        --repo /repo/main \
        --skymap lsst_cells_v2 \
        --output public/skymaps/lsst_cells_v2.json

Output schema (arrays rather than objects, to keep the file small):

    {
      "name": "lsst_cells_v2",
      "polygon": "inner",           # or "outer", per --polygon
      "edgeSamples": 1,             # points emitted per tract edge
      "tractCount": 18938,
      "tracts": [
        [tractId, [ctrRa, ctrDec], [[ra, dec], ...]],
        ...
      ]
    }

All angles are degrees, ICRS, rounded to `--precision` decimals.
"""

from __future__ import annotations

import argparse
import json
import sys

import lsst.geom
import lsst.sphgeom
from lsst.daf.butler import Butler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="butler repo path or alias")
    parser.add_argument("--skymap", default="lsst_cells_v2", help="skymap name")
    parser.add_argument(
        "--collections",
        default="skymaps",
        help="collection holding the skyMap dataset (default: skymaps)",
    )
    parser.add_argument("--output", required=True, help="path to write JSON to")
    parser.add_argument(
        "--polygon",
        choices=("inner", "outer"),
        default="inner",
        help=(
            "which sky polygon to dump. inner is the smaller of the two, but "
            "on lsst_cells_v2 it still overlaps its neighbours by about 11 "
            "arcmin, so expect doubled lines along every tract edge either "
            "way (default: inner)"
        ),
    )
    parser.add_argument(
        "--edge-samples",
        type=int,
        default=1,
        help=(
            "points emitted per tract edge. 1 (the default) emits corners "
            "only, which is exact at every declination for a gnomonic (TAN) "
            "skymap: a tract is a rectangle in its own tangent plane, and "
            "gnomonic projection maps great circles to straight lines, so "
            "the edges are the great circles a viewer already draws between "
            "corners. Raise it only for a skymap on some other projection, "
            "where the edges are genuinely curved -- it costs file size in "
            "direct proportion"
        ),
    )
    parser.add_argument(
        "--precision",
        type=int,
        default=5,
        help="decimal places for degrees (5 dp is ~0.04 arcsec; default: 5)",
    )
    return parser.parse_args()


def tract_id(tract) -> int:
    """Tract id, across the property rename."""
    getter = getattr(tract, "tract_id", None)
    return int(getter) if getter is not None else int(tract.getId())


def centre(tract) -> lsst.geom.SpherePoint:
    """Tract centre, across the property rename."""
    coord = getattr(tract, "ctr_coord", None)
    return coord if coord is not None else tract.getCtrCoord()


def corners(tract, polygon: str) -> list[lsst.geom.SpherePoint]:
    """The tract's corner vertices as SpherePoints, in order around the tract.

    Taken from the sky polygons by name so the region asked for is the region
    dumped. Worth knowing before reading a grid drawn from this: on
    lsst_cells_v2 the *inner* polygons already overlap their neighbours by
    about 11 arcmin -- tracts run 1.684 degrees wide on centres 1.500 degrees
    apart -- and `getVertexList` reports the same geometry as
    `getInnerSkyPolygon`, so neither is the non-overlapping tessellation.
    """
    getter = "getInnerSkyPolygon" if polygon == "inner" else "getOuterSkyPolygon"
    sky_polygon = getattr(tract, getter)()

    return [
        lsst.geom.SpherePoint(
            lsst.geom.Angle(lsst.sphgeom.LonLat.longitudeOf(vertex).asRadians()),
            lsst.geom.Angle(lsst.sphgeom.LonLat.latitudeOf(vertex).asRadians()),
        )
        for vertex in sky_polygon.getVertices()
    ]


def boundary(tract, polygon: str, samples: int) -> list[lsst.geom.SpherePoint]:
    """Corner vertices, optionally subdivided along each edge.

    A tract is a rectangle in its own tangent plane, so subdividing in pixel
    space and projecting back through the WCS traces the true edge -- which
    matters near the poles, where a great circle between two corners visibly
    departs from the tract's declination boundary.
    """
    vertices = corners(tract, polygon)

    if samples <= 1:
        return vertices

    wcs = tract.getWcs()
    pixels = [wcs.skyToPixel(vertex) for vertex in vertices]
    sampled = []

    for index, start in enumerate(pixels):
        end = pixels[(index + 1) % len(pixels)]

        for step in range(samples):
            fraction = step / samples
            sampled.append(
                wcs.pixelToSky(
                    lsst.geom.Point2D(
                        start.getX() + (end.getX() - start.getX()) * fraction,
                        start.getY() + (end.getY() - start.getY()) * fraction,
                    )
                )
            )

    return sampled


def as_degrees(point: lsst.geom.SpherePoint, precision: int) -> list[float]:
    return [
        round(point.getLongitude().asDegrees(), precision),
        round(point.getLatitude().asDegrees(), precision),
    ]


def main() -> int:
    args = parse_args()

    butler = Butler(args.repo, collections=args.collections)
    skymap = butler.get("skyMap", skymap=args.skymap)

    tracts = []

    for tract in skymap:
        tracts.append(
            [
                tract_id(tract),
                as_degrees(centre(tract), args.precision),
                [
                    as_degrees(point, args.precision)
                    for point in boundary(tract, args.polygon, args.edge_samples)
                ],
            ]
        )

    document = {
        "name": args.skymap,
        "polygon": args.polygon,
        "edgeSamples": args.edge_samples,
        "tractCount": len(tracts),
        "tracts": tracts,
    }

    with open(args.output, "w") as stream:
        json.dump(document, stream, separators=(",", ":"))

    print(f"wrote {len(tracts)} tracts to {args.output}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
