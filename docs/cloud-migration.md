# Cloud Migration Plan

This document tracks the migration of this app from a single-PC LAN deployment to a cloud-native architecture on AWS, along with the reasoning behind each decision. Written as I go — sections marked `[ ] Planned` haven't been done yet.

---

## Why migrate?

The current deployment has real limitations I want to solve, and they happen to map well onto core cloud engineering skills:

| Limitation today | Cloud solution | Skill demonstrated |
|---|---|---|
| App only runs while one specific PC is on | Always-on managed compute | Compute services (ECS/EB) |
| SQLite file = single point of failure, no backups | Managed relational database | RDS, backup/restore |
| No HTTPS, no real domain | ALB + ACM + Route 53 | Networking, TLS |
| Manual deploy (copy files, restart) | Automated deploy on `git push` | CI/CD (GitHub Actions) |
| Console-clicked infrastructure (not reproducible) | Infrastructure as Code | Terraform/CDK |
| No visibility into errors/performance | Centralized logging & alarms | CloudWatch, observability |

---

## Target architecture

```
                              ┌─────────────────┐
                              │   Route 53      │
                              │   (DNS)         │
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │  CloudFront      │
                              │  (CDN + HTTPS)   │
                              └────────┬────────┘
                    ┌──────────────────┼──────────────────┐
                    │                                      │
           ┌────────▼────────┐                   ┌────────▼────────┐
           │  S3 Bucket       │                   │  ALB             │
           │  (frontend       │                   │  (Application    │
           │   static files)  │                   │   Load Balancer) │
           └──────────────────┘                   └────────┬────────┘
                                                             │
                                                    ┌────────▼────────┐
                                                    │  ECS Fargate    │
                                                    │  (backend       │
                                                    │   containers)   │
                                                    └────────┬────────┘
                                          ┌──────────────────┼──────────────────┐
                                 ┌────────▼────────┐                  ┌────────▼────────┐
                                 │  RDS PostgreSQL  │                  │  S3 Bucket       │
                                 │  (database)      │                  │  (file uploads)  │
                                 └──────────────────┘                  └──────────────────┘
```

---

## Migration steps

### Phase 1 — Containerize `[ ] Planned`
- [ ] Write a `Dockerfile` for the backend (Node 22 base image, since `node:sqlite` needs it — though see DB note below)
- [ ] `docker-compose.yml` for local dev (backend + Postgres, matching the eventual cloud DB)
- [ ] Verify the container runs identically to the bare-metal version

### Phase 2 — Swap SQLite → PostgreSQL `[ ] Planned`
SQLite is great for the original single-PC deployment, but doesn't fit a multi-container, horizontally-scalable architecture (no shared file storage between containers by default). Plan:
- [ ] Add a database adapter layer so the same route handlers can target either SQLite (local dev) or PostgreSQL (cloud), OR
- [ ] Fully commit to PostgreSQL everywhere via Docker Compose for local dev too (simpler, more consistent — likely the better choice)
- [ ] Migrate schema (mostly direct translation — SQLite and PostgreSQL types are similar enough for this schema)
- [ ] Write a one-time data migration script for any existing real data

### Phase 3 — File storage → S3 `[ ] Planned`
- [ ] Replace local filesystem upload paths (`Project/{partNo}/APQP/...`) with S3 key prefixes of the same shape
- [ ] Update `multer` to use `multer-s3` instead of memory/disk storage
- [ ] Note: this also resolves the original "files might get moved/lost" problem discussed during local development — S3 + versioning eliminates that risk by design

### Phase 4 — Deploy to AWS `[ ] Planned`
- [ ] RDS PostgreSQL instance (start with smallest instance class — this is a low-traffic internal tool)
- [ ] ECR repository, push the backend container image
- [ ] ECS Fargate service + task definition
- [ ] Application Load Balancer in front of ECS
- [ ] S3 + CloudFront for the static frontend
- [ ] Route 53 + ACM for a real domain with HTTPS

### Phase 5 — Infrastructure as Code `[ ] Planned`
- [ ] Rebuild all of the above as Terraform (or AWS CDK) instead of console clicks
- [ ] Separate `dev` / `prod` workspaces or state files

### Phase 6 — CI/CD `[ ] Planned`
- [ ] GitHub Actions workflow: on push to `main` → build container → push to ECR → update ECS service
- [ ] Run basic tests before deploy (currently no automated tests — see below)

### Phase 7 — Observability `[ ] Planned`
- [ ] CloudWatch Logs for the ECS service
- [ ] Basic CloudWatch Alarms (5xx error rate, container restart count)
- [ ] Consider adding structured logging (currently just `console.log`)

---

## Cost considerations

This is an internal tool with low traffic (single manufacturing team, dozens of parts) — so the goal is **cheapest viable cloud setup**, not maximum scalability:

- RDS: smallest instance (`db.t4g.micro`) or consider Aurora Serverless v2 for true pay-per-use
- ECS Fargate: minimal vCPU/memory allocation, single task (no need for auto-scaling at this traffic level)
- S3 + CloudFront: effectively free at this scale (well within free tier for a long time)
- Estimated monthly cost: **under $20-30/month** at this scale — worth stating explicitly in interviews, since cost-consciousness is a real skill, not just "can you make it work"

---

## What I'm intentionally NOT doing (and why)

- **Not using Kubernetes** — ECS Fargate is the right-sized tool for one low-traffic service; EKS would be over-engineering for this use case and I'd rather demonstrate good judgment than maximum tool usage
- **Not multi-region** — this is an internal single-office tool; multi-region adds cost and complexity with no real benefit here
- **Not microservices** — the backend is small enough that splitting it into services would add operational overhead without a clear win
