import { setFailed } from "@actions/core";
import { getOctokit, context } from "@actions/github"

const requireToken = () => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    const message = "github token must be defined";
    setFailed(message);
    throw message
  }

  try {
    getOctokit(token)
  } catch (err) {
    const message = "token provided failed to initialize octokit";
    setFailed(message);
    throw message
  }

  return token
}

const requireOctokit = () => {
  const token = requireToken();
  const github = getOctokit(token);

  if (!github?.rest) {
    const message = "something went wrong when instantiating octokit"
    setFailed(message);
    throw message
  }

  return github.rest
}

const requirePr = async (prNum: number) => {
  const Github = requireOctokit();

  const { data: pr } = await Github.pulls.get({
    repo: context.repo.repo,
    owner: context.repo.owner,
    pull_number: prNum
  });

  if (!pr) {
    const message = `PR ${prNum} was not found to be associated with a real pull request`
    setFailed(message);
    throw message;
  }

  if (pr.merged) {
    const message = `PR ${prNum} is already merged; quitting...`
    setFailed(message);
    throw message;
  }

  return pr;
};

const requirePullNumber = () => {
  const pullNumber = process.env.PULL_NUMBER;
  if (!pullNumber) {
    const message = [
      "this action requires that a pull request number be provided",
      "it doesn't matter where or how that is done, but any information",
      "in context will be ignored in favor of the manual one provided"
    ].join(" ")
    setFailed(message);
    throw message;
  }
  return parseInt(pullNumber);
}

/**
 * @returns {octokit pr}: the pr associated with the triggering event of this workflow_run
 */
export const requirePRFromEnv = async () => {
  // verifies that the event type is of workflow_run
  const pullNum = requirePullNumber();
  return requirePr(pullNum)
}
