// Stage 6: Deploy to cloud (GitHub + Railway)
// Creates a new public GitHub repo, pushes the generated project, then
// creates a Railway project linked to that repo with a Postgres plugin.
// Returns public URLs.
//
// If tokens are missing, returns a no-op placeholder so the pipeline still
// completes cleanly.

import { isGitHubConfigured, createRepo, pushProjectFiles } from "@/lib/deploy/github";
import { isRailwayConfigured, deployFromGitHub }            from "@/lib/deploy/railway";

export type DeployOutput = {
    skipped?:      boolean;
    reason?:       string;
    github?:       { owner: string; repo: string; html_url: string; commitSha: string; files: number };
    railway?:      { projectId: string; railwayUrl: string; backendUrl?: string; frontendUrl?: string };
};

function shortId() {
    return Math.random().toString(36).slice(2, 8);
}

function safeRepoName(base: string) {
    const slug = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    return `opm-${slug.slice(0, 40)}-${shortId()}`;
}

export async function deployToCloud(input: {
    jobId:      string;
    filename:   string;
    outputDir?: string;
}): Promise<DeployOutput> {
    if (!input.outputDir) {
        return { skipped: true, reason: "no generated project directory" };
    }
    if (!isGitHubConfigured() || !isRailwayConfigured()) {
        return {
            skipped: true,
            reason:  "GITHUB_TOKEN / GITHUB_OWNER / RAILWAY_TOKEN not set — skipping cloud deploy",
        };
    }

    const repoName = safeRepoName(input.filename.replace(/\.[^.]+$/, ""));

    // 1. Create GitHub repo
    const repo = await createRepo(repoName);

    // 2. Push project
    const push = await pushProjectFiles(repo, input.outputDir);

    // 3. Railway project + services
    const deploy = await deployFromGitHub({
        projectName: repoName,
        githubOwner: repo.owner,
        githubRepo:  repo.repo,
    });

    return {
        github: {
            owner:     repo.owner,
            repo:      repo.repo,
            html_url:  repo.html_url,
            commitSha: push.commitSha,
            files:     push.filesPushed,
        },
        railway: {
            projectId:   deploy.projectId,
            railwayUrl:  deploy.railwayUrl,
            backendUrl:  deploy.backendUrl,
            frontendUrl: deploy.frontendUrl,
        },
    };
}
