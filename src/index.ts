import { setFailed } from "@actions/core";
import { getOctokit, context } from "@actions/github";
import { requirePRFromEnv } from "./requirePRFromWorkflowRun";
import moment from "moment";
import _ from "lodash";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const BOT_WORKFLOW_ID = process.env.ID_TO_RERUN;
const EVENT_TYPE = process.env.EVENT_TYPE;

const setDebugContext = (debugEnv?: NodeJS.ProcessEnv) => {
  const env = { ...process.env, ...debugEnv };
  process.env = env;

  // By instantiating after above it allows it to initialize with custom env
  const context = require("@actions/github").context;

  context.payload.pull_request = {
    base: {
      sha: env.BASE_SHA
    },
    head: {
      sha: env.HEAD_SHA
    },
    number: parseInt(env.PULL_NUMBER || "") || 0
  };

  context.payload.repository = {
    // @ts-ignore
    name: env.REPO_NAME,
    owner: {
      key: "",
      // @ts-ignore
      login: env.REPO_OWNER_NAME,
      name: env.REPO_OWNER_NAME
    },
    full_name: `${env.REPO_OWNER}/${env.REPO_NAME}`
  };
  context.eventName = env.EVENT_TYPE;
};

// Find latest run with pull_request_target and rerun
// pull_request_target is necessary because otherwise the secret fails
// this is also cleaner than deleting (what was done previously)
const rerunBot = async () => {
  const Github = getOctokit(GITHUB_TOKEN).rest;
  const pr = await requirePRFromEnv();
  console.log("requesting with", {
    owner: context.repo.owner,
    repo: context.repo.repo,
    workflow_id: BOT_WORKFLOW_ID,
    event: EVENT_TYPE
  })
  const workflowRuns = await Github.actions
    .listWorkflowRuns({
      owner: context.repo.owner,
      repo: context.repo.repo,
      workflow_id: BOT_WORKFLOW_ID,
      event: EVENT_TYPE
    })
    .then((res) =>
      res.data.workflow_runs.filter((run) => run.head_sha === pr.head.sha)
    ).catch(err => {
      setFailed(err);
      throw err;
    });

  if (!workflowRuns || !workflowRuns[0] || workflowRuns.length === 0) {
    // the failed workflow was already deleted
    const message = "No workflow runs were found to re-run!";
    setFailed(message);
    throw message;
  }

  // if (workflowRuns.length !== 1) {
  //   const message = [
  //     `expected only 1 workflow run by ${pr.user?.login} of type`,
  //     `pull_request_target to exist, but found more than one; aborting...`
  //   ].join(" ")
  //   setFailed(message);
  //   throw message;
  // }

  const run = _.maxBy(workflowRuns, (run) => run.run_started_at ? moment(run.run_started_at).unix() : 0);
  if (run.conclusion === "failure") {
    console.log("Found failed workflow run, re-running...\n")
    await Github.actions.reRunWorkflow({
      repo: context.repo.repo,
      owner: context.repo.owner,
      run_id: run.id
    }).then(res => {
      console.log("Success!");
      console.log(res.data);
    }).catch(err => {
      setFailed(err);
      throw err;
    })
  } else {
    console.log("The found run(s) did not fail; so not re-running");
  }
  console.log(`all found runs (a total of ${workflowRuns.length}) were found =========================`)
  console.log(workflowRuns);
};

// only runs the bot if the CI statuses pass; checks every 30 seconds
if (process.env.NODE_ENV === "development") setDebugContext();

console.log(
  [
    "This branched action reruns the most recent auto-merge-bot",
    "run on the PR in context; it's meant to be triggered by an event of",
    "workflow_run; it was designed as a work-around because when a review",
    "is left, and the auto-merge-bot re-runs, github creates a new workflow run",
    "(of event-type pull_request_review) and does not remove the previous",
    "run based on event-type pull_request_target; this was also designed as a solution to the fact",
    "that if the bot runs on pull_request_review on an external fork it will",
    "fail to properly send the github secret; essentially, this prevents Github's default behavior of",
    "leaving a failed run (which is confusing for authors) and actually lets the new run run..",
    "this is all well and good, but there was another issue as well; because github",
    "runs the pull_request_review wrt to the source branch (so in the case of a pr",
    "from a forked repo) the github token is not guaranteed to be known while calling",
    "this action; so instead this action must be a side-effect trigger from a workflow_run",
    "event type which is guaranteed to be in-scope of the primary repository and thus",
    "have access to the github token; this solution is a bit hacky, but it is mostly integrated",
    "and it should (🙏) be reliable for the future; either way, thanks github 😬\n\n"
  ].join(" ")
);

console.log([
  `Pull number provided: ${process.env.PULL_NUMBER}`,
  `Event type provided: ${process.env.EVENT_TYPE}`,
  `Bot ID: ${process.env.ID_TO_RERUN}`
].join("\n"))
rerunBot();
