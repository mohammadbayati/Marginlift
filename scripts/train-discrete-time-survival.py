import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from ml.discrete_time_survival import train_discrete_time_survival  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Train MarginLift discrete-time survival candidate")
    parser.add_argument("dataset", help="Path to channel-retention dataset JSON")
    parser.add_argument("--output-dir", default="data/models/channel-retention")
    parser.add_argument("--minimum-episodes", type=int, default=200)
    args = parser.parse_args()

    dataset = json.loads(Path(args.dataset).read_text(encoding="utf-8"))
    report = train_discrete_time_survival(
        dataset,
        output_dir=args.output_dir,
        minimum_episodes=args.minimum_episodes,
    )
    print(json.dumps({
        "status": report["status"],
        "gateStatus": report["gateStatus"],
        "modelVersion": report.get("modelVersion"),
        "nextActionFa": report["nextActionFa"],
        "modelCard": str(Path(args.output_dir) / "model-card.json"),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
