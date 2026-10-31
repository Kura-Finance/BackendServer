#!/usr/bin/env python3
"""Turn a backed-up Cloud Run service (``gcloud run services describe --format=json``)
into a ``gcloud run deploy`` invocation for the destination project.

Stdlib only. Usage:

    rewrite_service.py SERVICE.json \
        --src-project SRC --dst-project DST \
        --src-sql-conn SRC:REGION:INST --dst-sql-conn DST:REGION:INST \
        --image gcr.io/DST/svc:tag \
        [--db-password NEW] [--region REGION] \
        --out-env ENVFILE.yaml --out-flags FLAGS.txt

Writes:
  ENVFILE.yaml  env vars for ``--env-vars-file`` (comma-safe, unlike --set-env-vars)
  FLAGS.txt     one gcloud flag per line (memory, cpu, timeout, concurrency, ...)
Prints the resolved service name on stdout.
"""
import argparse
import json
import sys


def yaml_scalar(value: str) -> str:
    # JSON string escaping is a valid YAML double-quoted scalar.
    return json.dumps(value, ensure_ascii=False)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("service_json")
    ap.add_argument("--src-project", required=True)
    ap.add_argument("--dst-project", required=True)
    ap.add_argument("--src-sql-conn", default="")
    ap.add_argument("--dst-sql-conn", default="")
    ap.add_argument("--image", required=True)
    ap.add_argument("--db-password", default="")
    ap.add_argument("--region", default="")
    ap.add_argument("--out-env", required=True)
    ap.add_argument("--out-flags", required=True)
    args = ap.parse_args()

    with open(args.service_json) as f:
        svc = json.load(f)

    name = svc["metadata"]["name"]
    tmpl = svc["spec"]["template"]
    ann = tmpl["metadata"].get("annotations", {})
    cspec = tmpl["spec"]
    container = cspec["containers"][0]

    def rewrite(v: str) -> str:
        if args.src_sql_conn and args.dst_sql_conn:
            v = v.replace(args.src_sql_conn, args.dst_sql_conn)
        return v.replace(args.src_project, args.dst_project)

    env_lines = []
    secret_refs = []
    for e in container.get("env", []):
        k = e["name"]
        if "valueFrom" in e:
            secret_refs.append(k)
            continue
        v = e.get("value", "")
        if k == "DB_PASSWORD" and args.db_password:
            v = args.db_password
        else:
            v = rewrite(v)
        env_lines.append(f"{k}: {yaml_scalar(v)}")

    with open(args.out_env, "w") as f:
        f.write("\n".join(env_lines) + ("\n" if env_lines else ""))

    flags = []
    res = container.get("resources", {}).get("limits", {})
    if res.get("memory"):
        flags.append(f"--memory={res['memory']}")
    if res.get("cpu"):
        flags.append(f"--cpu={res['cpu']}")
    if cspec.get("timeoutSeconds"):
        flags.append(f"--timeout={cspec['timeoutSeconds']}")
    if cspec.get("containerConcurrency"):
        flags.append(f"--concurrency={cspec['containerConcurrency']}")
    ports = container.get("ports") or []
    if ports and ports[0].get("containerPort"):
        flags.append(f"--port={ports[0]['containerPort']}")
    if ann.get("autoscaling.knative.dev/minScale"):
        flags.append(f"--min-instances={ann['autoscaling.knative.dev/minScale']}")
    if ann.get("autoscaling.knative.dev/maxScale"):
        flags.append(f"--max-instances={ann['autoscaling.knative.dev/maxScale']}")
    if ann.get("run.googleapis.com/cpu-throttling") == "false":
        flags.append("--no-cpu-throttling")
    if ann.get("run.googleapis.com/startup-cpu-boost") == "true":
        flags.append("--cpu-boost")
    if ann.get("run.googleapis.com/execution-environment"):
        flags.append(f"--execution-environment={ann['run.googleapis.com/execution-environment']}")
    # Only services that had a Cloud SQL attachment get one in the new project.
    src_sql = ann.get("run.googleapis.com/cloudsql-instances", "")
    if src_sql:
        if args.dst_sql_conn:
            flags.append(f"--add-cloudsql-instances={args.dst_sql_conn}")
        else:
            flags.append(f"--add-cloudsql-instances={rewrite(src_sql)}")
    svc_ann = svc["metadata"].get("annotations", {})
    ingress = svc_ann.get("run.googleapis.com/ingress")
    if ingress:
        flags.append(f"--ingress={ingress}")
    if container.get("command"):
        flags.append("--command=" + ",".join(container["command"]))
    if container.get("args"):
        flags.append("--args=" + ",".join(container["args"]))

    with open(args.out_flags, "w") as f:
        f.write("\n".join(flags) + "\n")

    if secret_refs:
        print(
            f"WARNING: {name}: env vars backed by Secret Manager were skipped "
            f"(recreate the secrets in {args.dst_project} and re-add): {', '.join(secret_refs)}",
            file=sys.stderr,
        )
    sa = cspec.get("serviceAccountName", "")
    if sa and not sa.endswith("-compute@developer.gserviceaccount.com"):
        print(f"NOTE: {name} ran as custom service account {sa}; recreate it and pass --service-account.", file=sys.stderr)

    print(name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
