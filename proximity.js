/*
 * This file is part of the Dash-To-Panel extension for Gnome 3
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

const Lang = imports.lang;
const Meta = imports.gi.Meta;

const Layout = imports.ui.layout;
const Main = imports.ui.main;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

//timeout intervals
const MIN_UPDATE_MS = 200;

//timeout names
const T1 = 'limitUpdateTimeout';

var Mode = {
    ALL_WINDOWS: 0,
    FOCUSED_WINDOWS: 1,
    MAXIMIZED_WINDOWS: 2
};

var ProximityWatch = new Lang.Class({
    Name: 'DashToPanel.ProximityWatch',

    _init: function(actor, mode, xThreshold, yThreshold, handler) {
        this.actor = actor;
        this.mode = mode;
        this.threshold = [xThreshold, yThreshold];
        this.handler = handler;

        this._allocationChangedId = actor.connect('allocation-changed', () => this._update());

        this._update();
    },

    destroy: function() {
        this.actor.disconnect(this._allocationChangedId);
    },

    _update: function() {
        this.monitorIndex = Main.layoutManager.findIndexForActor(this.actor);

        this._updateWatchRect();
    },

    _updateWatchRect: function() {
        let [actorX, actorY] = this.actor.get_position();

        this.rect = new Meta.Rectangle({ 
            x: actorX - this.threshold[0],
            y: actorY - this.threshold[1],
            width: this.actor.width + this.threshold[0] * 2,
            height: this.actor.height + this.threshold[1] * 2 
        });
    },
});

var ProximityManager = new Lang.Class({
    Name: 'DashToPanel.ProximityManager',

    _init: function() {
        this._counter = 1;
        this._watches = {};
        this._focusedWindowInfo = null;

        this._signalsHandler = new Utils.GlobalSignalsHandler();
        this._timeoutsHandler = new Utils.TimeoutsHandler();

        this._bindSignals();
        this._setFocusedWindow();
    },

    createWatch: function(actor, mode, xThreshold, yThreshold, handler) {
        let watch = new ProximityWatch(actor, mode, xThreshold, yThreshold, handler);

        this._watches[this._counter] = watch;
        this.update();
        
        return this._counter++;
    },

    removeWatch: function(id) {
        if (this._watches[id]) {
            this._watches[id].destroy();
            delete this._watches[id];
        }
    },

    update() {
        this._queueUpdate(true);
    },

    destroy: function() {
        this._signalsHandler.destroy();
        this._timeoutsHandler.destroy();
        this._disconnectFocusedWindow();
        Object.keys(this._watches).forEach(id => this.removeWatch(id));
    },

    _bindSignals: function() {
        this._signalsHandler.add(
            [
                Utils.DisplayWrapper.getScreen(),
                'restacked',
                () => this._queueUpdate()
            ],
            [
                global.display,
                'notify::focus-window', 
                () => {
                    this._setFocusedWindow();
                    this._queueUpdate();
                }
            ],
            [
                global.window_group,
                [
                    'actor-added',
                    'actor-removed'
                ],
                () => this._queueUpdate()
            ]
        );
    },

    _setFocusedWindow: function() {
        this._disconnectFocusedWindow();

        let focusedWindow = global.display.focus_window;

        if (focusedWindow) {
            let focusedWindowInfo = this._getFocusedWindowInfo(focusedWindow);

            if (this._checkIfHandledWindowType(focusedWindowInfo.metaWindow)) {
                focusedWindowInfo.id = focusedWindowInfo.window.connect('allocation-changed', () => this._queueUpdate())
                this._focusedWindowInfo = focusedWindowInfo;
            }
        }
    },

    _getFocusedWindowInfo: function(focusedWindow) {
        let focusedWindowInfo = { window: focusedWindow.get_compositor_private() };
        
        focusedWindowInfo.metaWindow = focusedWindowInfo.window.get_meta_window();

        if (focusedWindow.is_attached_dialog()) {
            let mainMetaWindow = focusedWindow.get_transient_for();

            if (focusedWindowInfo.metaWindow.get_frame_rect().height < mainMetaWindow.get_frame_rect().height) {
                focusedWindowInfo.window = mainMetaWindow.get_compositor_private();
                focusedWindowInfo.metaWindow = mainMetaWindow;
            }
        }

        return focusedWindowInfo;
    },

    _disconnectFocusedWindow: function() {
        if (this._focusedWindowInfo) {
            this._focusedWindowInfo.window.disconnect(this._focusedWindowInfo.id);
            this._focusedWindowInfo = null;
        }
    },

    _getHandledWindows: function() {
        return global.get_window_actors()
                     .map(w => w.get_meta_window())
                     .filter(mw => this._checkIfHandledWindow(mw));
    },

    _checkIfHandledWindow: function(metaWindow) {
        return metaWindow && !metaWindow.minimized &&
            //    metaWindow.get_workspace().index() == Utils.DisplayWrapper.getWorkspaceManager().get_active_workspace_index() &&
            //    metaWindow.get_monitor() == this._monitor.index &&
               this._checkIfHandledWindowType(metaWindow);
    },

    _checkIfHandledWindowType: function(metaWindow) {
        let metaWindowType = metaWindow.get_window_type();

        //https://www.roojs.org/seed/gir-1.2-gtk-3.0/seed/Meta.WindowType.html
        return metaWindowType <= Meta.WindowType.SPLASHSCREEN && 
               metaWindowType != Meta.WindowType.DESKTOP;
    },

    _queueUpdate: function(noDelay) {
        if (!noDelay && this._timeoutsHandler.getId(T1)) {
            //limit the number of updates
            return this._pendingUpdate = true;
        }

        this._timeoutsHandler.add([T1, MIN_UPDATE_MS, () => this._endLimitUpdate()]);

        let metaWindows = this._getHandledWindows();
        
        Object.keys(this._watches).forEach(id => {
            let watch = this._watches[id];
            let overlap = this._update(watch, metaWindows);

            if (overlap !== watch.overlap) {
                watch.handler(overlap);
                watch.overlap = overlap;
            }
        });
    },

    _endLimitUpdate: function() {
        if (this._pendingUpdate) {
            this._pendingUpdate = false;
            this._queueUpdate();
        }
    },

    _update: function(watch, metaWindows) {
        if (watch.mode === Mode.FOCUSED_WINDOWS) {
            return (this._focusedWindowInfo && 
                    this._checkIfHandledWindow(this._focusedWindowInfo.metaWindow) &&
                    this._checkProximity(this._focusedWindowInfo.metaWindow, watch));
        } 
        
        if (watch.mode === Mode.MAXIMIZED_WINDOWS) {
            return metaWindows.some(mw => mw.maximized_vertically && mw.maximized_horizontally && 
                                          mw.get_monitor() == watch.monitorIndex);
        } else if (watch.mode === Mode.ALL_WINDOWS) {
            return metaWindows.some(mw => this._checkProximity(mw, watch));
        }
    },

    _checkProximity: function(metaWindow, watch) {
        return metaWindow.get_frame_rect().overlap(watch.rect);
    },
});