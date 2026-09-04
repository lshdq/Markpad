import assert from 'node:assert/strict';
import test from 'node:test';

import { readRustBackend, readSource, sliceBetween } from './sourceTree.js';

const backend = readRustBackend();
const app = readSource('src-tauri/src/app.rs');
const runtime = readSource('src-tauri/src/window_runtime.rs');

// The plugin builder chain, from `Builder::default()` to its `.build()`.
const pluginBuilder = sliceBetween(app, 'tauri_plugin_window_state::Builder::default()', '.build()');

test('the window-state plugin never restores visibility', () => {
	// VISIBLE makes the plugin's create-time restore call show()+set_focus()
	// inside build() — an empty window on screen and stolen focus long before
	// the frontend's show_window is meant to reveal it (#702). A window being
	// closed, which is when the plugin saves, is always visible, so the flag
	// has nothing to offer the save side either.
	assert.doesNotMatch(pluginBuilder, /StateFlags::VISIBLE/);
	assert.doesNotMatch(backend, /StateFlags::VISIBLE/, 'VISIBLE must not come back through another flags set');
});

test('create-time restore is skipped for every viewer window', () => {
	// The skip list works on MAPPED labels: "main", and every window-*
	// detached tab window via map_label's "secondary".
	assert.match(pluginBuilder, /\.skip_initial_state\("main"\)/);
	assert.match(pluginBuilder, /\.skip_initial_state\("secondary"\)/);
});

test('the plugin keeps its default state filename', () => {
	// startup_geometry reads DEFAULT_FILENAME; a with_filename here would
	// silently fork the restore source from the save target.
	assert.doesNotMatch(pluginBuilder, /with_filename/);
});

test('geometry restore has exactly one implementation, shared by both window builders', () => {
	assert.equal(backend.match(/\bfn startup_geometry\b/g)?.length, 1);
	assert.equal(backend.match(/\bfn with_startup_geometry\b/g)?.length, 1);
	assert.equal(backend.match(/\bfn apply_startup_geometry\b/g)?.length, 1);

	// The main window…
	assert.match(app, /window_runtime::startup_geometry\(app\.handle\(\), label\)/);
	assert.match(app, /window_runtime::with_startup_geometry\(/);
	assert.match(app, /window_runtime::apply_startup_geometry\(/);

	// …and the detached tab window, under the plugin's mapped "secondary" key.
	const transfer = sliceBetween(runtime, 'pub fn create_transfer_window', 'let _ = window.set_shadow(true);');
	assert.match(transfer, /startup_geometry\(&app, "secondary"\)/);
	assert.match(transfer, /with_startup_geometry\(/);
	assert.match(transfer, /apply_startup_geometry\(/);
});

test('nobody calls the plugin restore directly', () => {
	// restore_state would reintroduce the show()+set_focus() and the
	// SW_MAXIMIZE→SW_HIDE flash this module exists to avoid.
	assert.doesNotMatch(backend, /\.restore_state\(/);
});

test('the main window is still built hidden and unfocused', () => {
	// The whole restore design rests on the frontend owning the reveal.
	assert.match(app, /\.visible\(false\)/);
	assert.match(app, /\.focused\(false\)/);
});

test('detached windows keep sharing the secondary state entry', () => {
	// The skip list and the geometry read both key on the MAPPED label —
	// this mapping is what makes "secondary" cover every window-* label.
	assert.match(pluginBuilder, /\.map_label\(/);
	assert.match(pluginBuilder, /label\.starts_with\("window-"\)/);
	assert.match(pluginBuilder, /"secondary"/);
});

test('maximization on Windows is deferred to a quiet post-show path', () => {
	// Every tao path to maximization (maximize(), with_maximized, even the
	// quiet show of a MAXIMIZED-flagged window) ends in
	// ShowWindow(SW_MAXIMIZE), which activates — a cold start would yank
	// focus (#702). The quiet path is WS_MAXIMIZE + SWP_NOACTIVATE applied
	// after the show, in the same event-loop turn.
	assert.equal(backend.match(/\bfn quiet_maximize\b/g)?.length, 1);

	// Both window creators register the deferral…
	assert.match(app, /note_pending_quiet_maximize\(app\.handle\(\), label, &geometry\)/);
	const transfer = sliceBetween(runtime, 'pub fn create_transfer_window', 'let _ = window.set_shadow(true);');
	assert.match(transfer, /note_pending_quiet_maximize\(&app, &label, &geometry\)/);

	// …and show_window is the one place that consumes it, atomically with
	// the show on the main thread.
	const showWindow = sliceBetween(runtime, 'pub async fn show_window', '\n}\n');
	assert.match(showWindow, /pending_quiet_maximize/);
	assert.match(showWindow, /run_on_main_thread/);
	assert.match(showWindow, /quiet_maximize/);
});

test('the builder maximizes only where that is side-effect free', () => {
	// Off Windows tao's with_maximized on a hidden window is quiet; on
	// Windows it is the SW_MAXIMIZE→SW_HIDE flash — so the builder path
	// must carry the cfg gate.
	const withGeometry = sliceBetween(runtime, 'pub fn with_startup_geometry', 'pub fn apply_startup_geometry');
	assert.match(withGeometry, /geometry\.maximized && cfg!\(not\(target_os = "windows"\)\)/);

	// And the physical rect application must NOT skip maximized windows on
	// Windows — the rect applied there is what Windows restores to.
	const apply = sliceBetween(runtime, 'pub fn apply_startup_geometry', '\n}\n');
	assert.match(apply, /builder_owns_rect/);
});

test('the pending quiet maximize is registered only after the window exists', () => {
	// Registered only once build() has succeeded: a failed build must not
	// leave a stale label in the pending set that a later same-labelled
	// window would consume as a bogus quiet maximize.
	assert.ok(
		app.indexOf('window_builder.build()?') < app.indexOf('note_pending_quiet_maximize'),
		'main window: note_pending_quiet_maximize must follow the successful build'
	);
	const transfer = sliceBetween(runtime, 'pub fn create_transfer_window', 'let _ = window.set_shadow(true);');
	assert.ok(
		transfer.indexOf('builder.build()') < transfer.indexOf('note_pending_quiet_maximize'),
		'transfer window: note_pending_quiet_maximize must follow the successful build'
	);
	assert.doesNotMatch(transfer, /allow\(unused_mut\)/, 'the transfer builder no longer needs an unused_mut allowance');
});

test('the pending quiet maximize set is Windows-only state', () => {
	// Every reader compiles away off Windows; an ungated field/import would
	// be dead code there and fail clippy — which a Windows dev box never
	// sees. Pin the cfg gates so the non-Windows build stays clean.
	assert.match(runtime, /#\[cfg\(target_os = "windows"\)\]\nuse std::collections::HashSet;/);
	assert.match(runtime, /#\[cfg\(target_os = "windows"\)\]\n\s*pub\(crate\) pending_quiet_maximize: Mutex<HashSet<String>>/);
	assert.match(runtime, /#\[cfg\(target_os = "windows"\)\]\n\s*pending_quiet_maximize: Mutex::new\(HashSet::new\(\)\)/);
});

test('the transfer window flushes the plugin cache before reading it', () => {
	// The plugin writes its disk file only at process exit; without this
	// flush a second detach in one session would restore last exit's
	// geometry instead of where the user just left the last window.
	const transfer = sliceBetween(runtime, 'pub fn create_transfer_window', 'let geometry = startup_geometry');
	assert.match(transfer, /save_window_state\(/);
});
