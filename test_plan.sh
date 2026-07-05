#!/bin/bash
set -e

pnpm run check-types
pnpm run lint
xvfb-run -a pnpm test
