"""Expands a xacro file to URDF without ROS: $(find pkg) resolves through a given package map.

usage: expand_xacro.py job.json   (job: {"input", "output", "args": {}, "packages": {name: dir}})
"""
import json
import sys

import xacro
from xacro import substitution_args as subst


def main():
    with open(sys.argv[1]) as f:
        job = json.load(f)
    packages = job["packages"]

    def find(pkg):
        if pkg not in packages:
            # Often only referenced by simulator plugin parameters; a real include of it still fails loudly.
            print(f"warning: package {pkg} is not in the checkout", file=sys.stderr)
            return f"/missing-package/{pkg}"
        return packages[pkg]

    # xacro captures _eval_find in a dict at import time, so patch both.
    subst._eval_find = find
    subst._eval_dict["find"] = find
    doc = xacro.process_file(job["input"], mappings=job.get("args") or {})
    with open(job["output"], "w") as f:
        f.write(doc.toprettyxml(indent="  "))


if __name__ == "__main__":
    main()
