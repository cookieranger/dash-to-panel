/*
 * Dash-To-Panel extension for Gnome 3
 * Copyright 2016 jderose9
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
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *
 * Credits:
 * This file is based on code from the Taskbar extension by Zorin OS
 * and code from the Dash to Dock extension by micheleg.
 * 
 * Code to re-anchor the panel was taken from Thoma5 BottomPanel:
 * https://github.com/Thoma5/gnome-shell-extension-bottompanel
 * 
 * Some code was also adapted from the upstream Gnome Shell source code.
 */


const Me = imports.misc.extensionUtils.getCurrentExtension();
const Clutter = imports.gi.Clutter;
const Convenience = Me.imports.convenience;
const Panel = Me.imports.panel;
const Lang = imports.lang;
const Main = imports.ui.main;
const PanelBox = Main.layoutManager.panelBox;
const St = imports.gi.St;

let panel;
let settings;

function init() {
}

function enable() {
    settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-panel');  
    panel = new Panel.taskbarPanel(settings);
    panel.enable();
}

function disable() {
    settings.run_dispose();
    settings = null;
    panel = null;
}


