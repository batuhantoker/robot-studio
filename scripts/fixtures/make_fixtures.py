"""Record ground truth from the Python package for the studio's TypeScript tests.

Run from the repo root: npm run fixtures (installs four-dof-arm from GitHub at the pinned commit).
"""

from __future__ import annotations

import copy
import json
import math
import os
from pathlib import Path

import numpy as np

from four_dof_arm import Robot4DOF
from four_dof_arm.serial_arm import SerialArm
from four_dof_arm.serial_arm.analysis import analyze

STUDIO = Path(__file__).resolve().parents[2]
PRESETS = STUDIO / "presets" / "serial-arm"
OUT = Path(os.environ.get("FIXTURES_OUT", STUDIO / "test" / "fixtures" / "python.json"))


def robots() -> dict[str, SerialArm]:
    found = {}
    for path in sorted(PRESETS.glob("*.json")):
        if "links" in json.loads(path.read_text(encoding="utf-8")):
            found[path.stem] = SerialArm.from_json(path)
    return found


def kinematics(arm: SerialArm, rng: np.random.Generator) -> list[dict]:
    cases = []
    for q in rng.uniform(*arm.joint_limits.T, size=(6, arm.n_joints)):
        position, rotation = arm.forward_kinematics(q)
        cases.append(
            {
                "q": q.tolist(),
                "position": position.tolist(),
                "rotation": rotation.reshape(-1).tolist(),
                "points": arm.joint_positions(q).tolist(),
                "jacobian": arm.jacobian(q).tolist(),
            }
        )
    return cases


def ik_cases(arm: SerialArm, rng: np.random.Generator) -> list[dict]:
    lower, upper = arm.joint_limits.T
    cases = []
    for _ in range(3):
        goal_q = rng.uniform(lower * 0.6, upper * 0.6)
        start = np.clip(goal_q + rng.uniform(-0.08, 0.08, arm.n_joints), lower, upper)
        target = arm.forward_kinematics(goal_q)[0]
        q, success, residual = arm.inverse_kinematics(target, q0=start, restarts=0)
        cases.append(
            {
                "target": target.tolist(),
                "q0": start.tolist(),
                "q": q.tolist(),
                "success": bool(success),
                "residual": residual,
            }
        )
    return cases


def validation_cases(base: dict) -> list[dict]:
    mutations = {
        "valid": lambda c: None,
        "unknown_robot_key": lambda c: c.update(color="red"),
        "units": lambda c: c.update(units="mm"),
        "empty_links": lambda c: c.update(links=[]),
        "bad_name": lambda c: c["links"][0].update(name="1st"),
        "duplicate_names": lambda c: c["links"][1].update(name=c["links"][0]["name"]),
        "zero_axis": lambda c: c["links"][0].update(axis=[0, 0, 0]),
        "unnormalized_axis": lambda c: c["links"][0].update(axis=[0, 0, 7]),
        "bool_mass": lambda c: c["links"][0].update(mass=True),
        "negative_mass": lambda c: c["links"][0].update(mass=-1),
        "inverted_limits": lambda c: c["links"][0].update(limits=[1, -1]),
        "negative_damping": lambda c: c["links"][0].update(damping=-0.1),
        "zero_kd": lambda c: c["links"][0].update(kd=0),
        "missing_offset": lambda c: c["links"][0].pop("offset"),
        "unknown_link_key": lambda c: c["links"][0].update(style="cobot"),
        "negative_payload": lambda c: c.update(payload_mass=-0.1),
        "blank_name": lambda c: c.update(name="  "),
        "short_base": lambda c: c.update(base=[0, 0]),
    }
    cases = []
    for name, mutate in mutations.items():
        config = copy.deepcopy(base)
        mutate(config)
        try:
            normalized = SerialArm.from_dict(config).to_dict()
            cases.append({"name": name, "config": config, "ok": True, "normalized": normalized})
        except (ValueError, TypeError) as error:
            cases.append({"name": name, "config": config, "ok": False, "error": str(error)})
    return cases


def trajectory(arms: dict[str, SerialArm]) -> dict:
    scenario = json.loads((PRESETS / "reach_scenario.json").read_text(encoding="utf-8"))
    scenario.pop("targets")
    _, record, _ = analyze(arms["spatial_3link"], scenario, timestep=0.01, workspace_samples=1)
    _, default, _ = analyze(arms["planar_2link"], None, timestep=0.05, workspace_samples=1)
    pick = lambda r: {key: r[key].tolist() for key in ("t", "q", "qd", "qdd")}
    return {
        "scenario": {"robot": "spatial_3link", "timestep": 0.01, **scenario, **pick(record)},
        "default": {"robot": "planar_2link", "timestep": 0.05, "duration": 6.0, **pick(default)},
    }


def simulation(arms: dict[str, SerialArm]) -> dict:
    scenario = json.loads((PRESETS / "reach_scenario.json").read_text(encoding="utf-8"))
    scenario.pop("targets")
    scenario["duration"] = 2.0
    _, record, _ = analyze(arms["spatial_3link"], scenario, timestep=0.01, workspace_samples=1, simulate=True)
    keys = ("t", "q", "qd", "target_q", "target_qd", "torque", "requested_torque")
    return {"robot": "spatial_3link", "timestep": 0.01, **{k: record[k].tolist() for k in keys}}


def kane(rng: np.random.Generator) -> list[dict]:
    legacy = Robot4DOF()
    cases = []
    for q in rng.uniform(*legacy.joint_limits.T, size=(5, 4)):
        position, _ = legacy.forward_kinematics(q)
        cases.append({"q": q.tolist(), "position_mm": np.asarray(position).tolist()})
    return cases


def main() -> None:
    rng = np.random.default_rng(2026)
    arms = robots()
    fixture = {
        "robots": {
            name: {
                "config": arm.to_dict(),
                "mjcf": arm.to_mjcf(),
                "mjcf_dt_0_01": arm.to_mjcf(timestep=0.01),
                "kinematics": kinematics(arm, rng),
                "ik": ik_cases(arm, rng),
            }
            for name, arm in arms.items()
        },
        "validation": validation_cases(arms["spatial_3link"].to_dict()),
        "trajectory": trajectory(arms),
        "simulation": simulation(arms),
        "kane": kane(rng),
        "pi": math.pi,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fixture, allow_nan=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KiB)")


if __name__ == "__main__":
    main()
