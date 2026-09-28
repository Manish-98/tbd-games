import { escapeHtml } from '../../dom.js';
import { createLifecycle } from '../../shared/lifecycle.js';
import { createGitEngine } from './engine.js';
import { createCommandController, getCommandDefinition, getParameterOptions, PARAMETER_TYPES } from './command-palette.js';
import { createGitVisualization } from './visualization.js';
import { renderInspectionOutput } from './inspection-output.js';
import { READ_ONLY_COMMANDS } from './constants.js';
import { evaluateScenario, generateRegisteredScenario, getScenarioTemplates } from './scenarios/index.js';

let sequence = 0;
const DEFAULT_SCENARIO = 'missing-feature';

function seedFor(id) { sequence += 1; return `playroom-${id}-${sequence}`; }
function scenarioOptions(templates, selected) {
  return templates.map(t => `<option value="${escapeHtml(t.id)}" ${t.id === selected ? 'selected' : ''}>${escapeHtml(t.story.split('.')[0])}</option>`).join('');
}
function parameterControl(definition, parameter, value, state) {
  if (parameter.type === PARAMETER_TYPES.SELECT) {
    const options = getParameterOptions(definition.type, parameter.name, state).map(option =>
      `<option value="${escapeHtml(String(option.value))}" ${String(option.value) === String(value ?? '') ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('');
    return `<select data-command-parameter="${escapeHtml(parameter.name)}" aria-label="${escapeHtml(parameter.label)}"><option value="">Choose…</option>${options}</select>`;
  }
  if (parameter.type === PARAMETER_TYPES.TOGGLE) {
    return `<input type="checkbox" data-command-parameter="${escapeHtml(parameter.name)}" ${value ? 'checked' : ''} aria-label="${escapeHtml(parameter.label)}">`;
  }
  return `<input type="${parameter.type === PARAMETER_TYPES.NUMBER ? 'number' : 'text'}" data-command-parameter="${escapeHtml(parameter.name)}" value="${escapeHtml(String(value ?? ''))}" placeholder="${escapeHtml(parameter.label)}" aria-label="${escapeHtml(parameter.label)}">`;
}
function renderBuilder(controller, state, error) {
  const builder = controller.getBuilder();
  if (!builder) return '<p class="git-builder-empty">Choose a command to build it here.</p>';
  const definition = getCommandDefinition(builder.type);
  const fields = definition.parameters.filter(p => !p.visibleWhen || p.visibleWhen(builder.params || {})).map(p =>
    `<label class="git-parameter"><span>${escapeHtml(p.label)}</span>${parameterControl(definition, p, builder.params?.[p.name], state)}</label>`).join('');
  const validation = controller.validate();
  const errors = error ? `<p class="git-command-error">${escapeHtml(error)}</p>` :
    validation.valid ? '' : validation.errors.map(e => `<p class="git-command-error">${escapeHtml(e.message)}</p>`).join('');
  return `<div class="git-builder-header"><div><span class="section-label">Command builder</span><strong>${escapeHtml(definition.syntax)}</strong></div></div>
    <div class="git-parameters">${fields || '<p class="git-builder-empty">This command has no parameters.</p>'}</div>
    <div data-command-errors>${errors}</div>
    <div class="git-builder-actions"><button type="button" class="secondary-button" data-explain-command>Explain</button><button type="button" class="primary-button" data-execute-command ${validation.valid ? '' : 'disabled'}>Execute</button></div>
    <div class="git-command-explanation" data-command-explanation hidden></div>`;
}
function renderCommands(controller) {
  return controller.listCommands().map(c => `<button type="button" class="git-command-item ${controller.getBuilder()?.type === c.type ? 'active' : ''}" data-select-command="${escapeHtml(c.type)}"><strong>${escapeHtml(c.label)}</strong><span>${escapeHtml(c.syntax)}</span></button>`).join('');
}
function renderHistory(controller) {
  const history = controller.getHistory();
  return history.length ? history.slice().reverse().map(e => `<li><code>${escapeHtml(e.display)}</code></li>`).join('') : '<p class="git-history-empty">No commands executed yet.</p>';
}
function renderObjectives(result) {
  return `<div class="git-objective-state"><div class="git-panel-heading"><span class="section-label">Objective</span><strong>${result.complete ? 'Complete' : 'In progress'}</strong></div><ul>${result.results.map(r => `<li class="${r.satisfied ? 'satisfied' : ''}"><span aria-hidden="true">${r.satisfied ? '✓' : '○'}</span><span>${escapeHtml(r.description)}</span></li>`).join('')}</ul></div>`;
}
function renderCompletion(scenario) {
  return `<div class="git-complete" role="status"><span class="section-label">Scenario complete</span><h3>Repository objective reached.</h3><p>${escapeHtml(scenario.completionExplanation)}</p><button type="button" class="primary-button" data-regenerate>Generate another scenario</button></div>`;
}

export function initGitGame(section) {
  const view = section.querySelector('.git-view');
  const visualizationHost = section.querySelector('[data-git-visualization]');
  const commandHost = section.querySelector('[data-git-command]');
  const scenarioHost = section.querySelector('[data-git-scenario]');
  const lifecycle = createLifecycle();
  const templates = getScenarioTemplates();
  let scenario;
  let repository;
  let commands;
  let visualization;
  let selectedTemplate = DEFAULT_SCENARIO;
  let executionError = '';
  let inspectionOutput = null;
  let destroyed = false;

  function render() {
    if (destroyed) return;
    const state = repository.snapshot();
    const evaluation = evaluateScenario(scenario, state);
    scenarioHost.innerHTML = `<div class="git-story-card"><div><span class="section-label">Scenario</span><h3>${escapeHtml(scenario.parameters?.branch || scenario.templateId.replaceAll('-', ' '))}</h3><p>${escapeHtml(scenario.story)}</p></div><label class="git-scenario-picker"><span>Practice situation</span><select data-scenario-select>${scenarioOptions(templates, selectedTemplate)}</select></label></div>${renderObjectives(evaluation)}${evaluation.complete ? renderCompletion(scenario) : ''}`;
    const output = inspectionOutput
      ? renderInspectionOutput(inspectionOutput.command, inspectionOutput.data)
      : '<section class="git-inspection-output git-inspection-empty" aria-label="Git command output"><div class="git-panel-heading"><span class="section-label">Command output</span><strong>Inspection</strong></div><p>Run a read-only Git command to inspect repository information.</p></section>';
    commandHost.innerHTML = `<div class="git-command-layout"><aside class="git-command-list"><div class="git-panel-heading"><span class="section-label">Git commands</span><strong>${commands.listCommands().length}</strong></div><label class="git-search"><span>Find a command</span><input type="search" data-command-search placeholder="status, branch, merge…"></label><div data-command-list>${renderCommands(commands)}</div></aside><section class="git-builder" data-builder>${renderBuilder(commands, state, executionError)}${output}</section><aside class="git-history"><div class="git-panel-heading"><span class="section-label">Command history</span><strong>${commands.getHistory().length}</strong></div><ol>${renderHistory(commands)}</ol></aside></div>`;
    visualization.render(state);
  }
  function createScenario(id = selectedTemplate) {
    selectedTemplate = id;
    scenario = generateRegisteredScenario(id, { seed: seedFor(id) });
    repository = createGitEngine(scenario.repository);
    commands = createCommandController(repository, scenario.availableCommands);
    executionError = '';
    inspectionOutput = null;
    if (!visualization) visualization = createGitVisualization(visualizationHost);
    else visualization.reset(repository.snapshot());
    render();
  }
  function click(event) {
    if (event.target.closest('[data-regenerate]')) return createScenario();
    const select = event.target.closest('[data-select-command]');
    if (select) { commands.selectCommand(select.dataset.selectCommand); executionError = ''; render(); return; }
    if (event.target.closest('[data-explain-command]')) {
      const definition = getCommandDefinition(commands.getBuilder()?.type);
      const panel = commandHost.querySelector('[data-command-explanation]');
      if (definition && panel) { panel.textContent = definition.explanation; panel.hidden = false; }
      return;
    }
    if (event.target.closest('[data-execute-command]')) {
      const result = commands.execute();
      executionError = result.ok ? '' : result.error?.message || 'Git command failed.';
      if (result.ok && result.command && READ_ONLY_COMMANDS.includes(result.command.type)) {
        inspectionOutput = {
          command: result.command,
          data: result.data
        };
      }
      render();
    }
  }
  function refreshBuilderValidation() {
    const builder = commands.getBuilder();
    const builderView = commandHost.querySelector('[data-builder]');
    if (!builder || !builderView) return;
    const validation = commands.validate();
    const executeButton = builderView.querySelector('[data-execute-command]');
    const errorView = builderView.querySelector('[data-command-errors]');
    if (executeButton) executeButton.disabled = !validation.valid;
    if (errorView) {
      errorView.innerHTML = validation.valid
        ? ''
        : validation.errors.map(error => `<p class="git-command-error">${escapeHtml(error.message)}</p>`).join('');
    }
  }

  function input(event) {
    const parameter = event.target.closest('[data-command-parameter]');
    if (parameter) {
      const builder = commands.getBuilder();
      if (!builder) return;
      commands.setParameter(parameter.dataset.commandParameter, parameter.type === 'checkbox' ? parameter.checked : parameter.value);
      executionError = '';
      refreshBuilderValidation();
      return;
    }
    const search = event.target.closest('[data-command-search]');
    if (search) {
      const list = commandHost.querySelector('[data-command-list]');
      if (list) list.innerHTML = commands.listCommands(search.value).map(c => `<button type="button" class="git-command-item" data-select-command="${escapeHtml(c.type)}"><strong>${escapeHtml(c.label)}</strong><span>${escapeHtml(c.syntax)}</span></button>`).join('');
    }
  }
  function change(event) {
    const parameter = event.target.closest('[data-command-parameter]');
    if (parameter) {
      const builder = commands.getBuilder();
      if (builder) {
        commands.setParameter(parameter.dataset.commandParameter, parameter.type === 'checkbox' ? parameter.checked : parameter.value);
        executionError = '';
        refreshBuilderValidation();
      }
      return;
    }
    const select = event.target.closest('[data-scenario-select]');
    if (select) createScenario(select.value);
  }
  lifecycle.on(view, 'click', click);
  lifecycle.on(view, 'input', input);
  lifecycle.on(view, 'change', change);
  createScenario();
  return {
    render() { render(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      lifecycle.dispose();
      visualization?.destroy();
      scenario = null;
      repository = null;
      commands = null;
      visualization = null;
      view.innerHTML = '';
    }
  };
}
