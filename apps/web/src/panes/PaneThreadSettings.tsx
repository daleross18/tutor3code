import { DraftInput } from "../components/ui/draft-input";
import { Switch } from "../components/ui/switch";
import { SettingResetButton, SettingsRow } from "../components/settings/settingsLayout";
import { useOptionalSettingsScope } from "../components/settings/SettingsScopeContext";
import { useSearchableSetting } from "../components/settings/settingsSearch";
import { useProjects } from "../state/entities";
import { DEFAULT_PANE_THREAD_SETTINGS, usePaneThreadStore } from "./paneThreadStore";
import { previewTemplateProblem, PREVIEW_SLUG_TOKEN } from "./threadPreviewUrl";

const TEMPLATE_PROBLEMS = {
  "no-slug": `The template needs ${PREVIEW_SLUG_TOKEN}. No link shows.`,
  "no-url": "The template is not an http or https URL. No link shows.",
} as const;

function ReleasePaneRow() {
  const enabled = usePaneThreadStore((settings) => settings.releasePaneOnMergeSettle);
  const setEnabled = usePaneThreadStore((settings) => settings.setReleasePaneOnMergeSettle);
  const search = useSearchableSetting()("release-pane-on-settle");
  const defaultEnabled = DEFAULT_PANE_THREAD_SETTINGS.releasePaneOnMergeSettle;
  return (
    <SettingsRow
      {...search}
      description='With two or more panes or tabs, a pane shows a new thread when its thread settles after its pull request merged. Threads > "Auto-settle merged threads" settles the thread.'
      resetAction={
        enabled !== defaultEnabled ? (
          <SettingResetButton
            ariaLabel={`Reset ${search.title.toLowerCase()} to default`}
            onClick={() => setEnabled(defaultEnabled)}
          />
        ) : null
      }
      control={
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(Boolean(checked))}
          aria-label={search.title}
        />
      }
    />
  );
}

interface PreviewRepository {
  readonly key: string;
  readonly name: string;
}

/** The repositories of the settings scope: one project, one environment, or every project. */
function usePreviewRepositories(): ReadonlyArray<PreviewRepository> {
  const projects = useProjects();
  const scope = useOptionalSettingsScope()?.scope;
  const inScope = projects.filter((project) => {
    if (scope === undefined || scope.kind === "all" || scope.kind === "unavailable") return true;
    if (scope.kind === "environment") return project.environmentId === scope.environmentId;
    return scope.members.some(
      (member) => member.environmentId === project.environmentId && member.id === project.id,
    );
  });
  const byKey = new Map<string, PreviewRepository>();
  for (const project of inScope) {
    const identity = project.repositoryIdentity;
    if (identity == null || byKey.has(identity.canonicalKey)) continue;
    byKey.set(identity.canonicalKey, {
      key: identity.canonicalKey,
      name: identity.displayName ?? identity.canonicalKey,
    });
  }
  return [...byKey.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function PreviewTemplateRow({ repository }: { repository: PreviewRepository }) {
  const template = usePaneThreadStore(
    (settings) => settings.previewUrlTemplates[repository.key] ?? "",
  );
  const setTemplate = usePaneThreadStore((settings) => settings.setPreviewUrlTemplate);
  const problem = previewTemplateProblem(template);
  return (
    <SettingsRow
      title={repository.name}
      description={repository.name === repository.key ? undefined : repository.key}
      status={problem === "no-slug" || problem === "no-url" ? TEMPLATE_PROBLEMS[problem] : null}
      resetAction={
        template !== "" ? (
          <SettingResetButton
            ariaLabel={`Reset preview link of ${repository.name} to default`}
            onClick={() => setTemplate(repository.key, "")}
          />
        ) : null
      }
      control={
        <DraftInput
          size="sm"
          className="w-full sm:w-96"
          value={template}
          onCommit={(next) => setTemplate(repository.key, next)}
          placeholder={`https://${PREVIEW_SLUG_TOKEN}.preview.example.com`}
          spellCheck={false}
          aria-label={`Preview URL template of ${repository.name}`}
        />
      }
    />
  );
}

/** The pane and preview rows of the fork section in Settings > Appearance. */
export function PaneThreadSettingsRows() {
  const repositories = usePreviewRepositories();
  const searchableSetting = useSearchableSetting();
  return (
    <>
      <ReleasePaneRow />
      <SettingsRow
        {...searchableSetting("preview-url-template")}
        description="A thread with a pull request shows a preview link when its repository has a URL template here. {slug} stands for the branch slug of the pull request."
        status={repositories.length === 0 ? "No project with a repository here." : null}
      />
      {repositories.map((repository) => (
        <PreviewTemplateRow key={repository.key} repository={repository} />
      ))}
    </>
  );
}
