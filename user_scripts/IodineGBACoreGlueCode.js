"use strict";
/*
 * This file is part of IodineGBA
 *
 * Copyright (C) 2012-2013 Grant Galitz
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * version 2 as published by the Free Software Foundation.
 * The full license is available at http://www.gnu.org/licenses/gpl.html
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 */
var games = {
             "advancewars":
                [
                            "Advance Wars",
                            {
                                "lineskip":false,
                                "speedhack":true
                            }
                ],
             "alienhominid":
                [
                            "Alien Hominid",
                            {
                                "lineskip":false,
                                "speedhack":false
                            }
                ],
             "kirbymirror":
                [
                            "Kirby & The Amazing Mirror",
                            {
                                "lineskip":false,
                                "speedhack":false
                            }
                ],
             "kirbynightmare":
                [
                            "Kirby: Nightmare in Dreamland",
                            {
                                "lineskip":false,
                                "speedhack":true
                            }
                ],
             "marioparty":
                [
                            "Mario Party Advance",
                            {
                                "lineskip":false,
                                "speedhack":false
                            }
                ],
             "megamanbass":
                [
                            "Megaman & Bass",
                            {
                                "lineskip":false,
                                "speedhack":true
                            }
                ],
             "pokemonflorasky":
                [
                            "Pokemon Flora Sky Rom Hack",
                            {
                                "lineskip":false,
                                "speedhack":true
                            }
                ],
             "pokemonemerald":
                [
                            "Pokemon Emerald",
                            {
                                "lineskip":false,
                                "speedhack":true
                            }
                ],
             "pokemonruby":
                [
                            "Pokemon Ruby",
                            {
                                "lineskip":false,
                                "speedhack":false
                            }
                ],
             "pokemonsapphire":
                [
                            "Pokemon Sapphire",
                            {
                                "lineskip":false,
                                "speedhack":false
                            }
                ],
             "pokemonred":
                [
                            "Pokemon Fire Red",
                            {
                                "lineskip":false,
                                "speedhack":true
                            }
                ],
             "sonicbattle":
                [
                            "Sonic Battle",
                            {
                                "lineskip":false,
                                "speedhack":false
                            }
                ],
             "supermonkeyballjr":
                [
                            "Super Monkey Ball Jr.",
                            {
                                "lineskip":false,
                                "speedhack":false
                            }
                ],
             "superstar":
                [
                            "Mario & Luigi: Superstar Saga",
                            {
                                "lineskip":false,
                                "speedhack":false
                            }
                ],
             "supermarioadvance":
                [
                            "Super Mario Advance",
                            {
                                "lineskip":false,
                                "speedhack":false
                            }
                ],
              "bubblebobble":
                [
                            "Bubble Bobble",
                            {
                                "lineskip":false,
                                "speedhack":false
                            }
                ],
            "simpsons":
                [
                            "The Simpsons: Road Rage",
                            {
                                "lineskip":false,
                                "speedhack":false
                            }
                ],
            "gba_video_pokemon_1":
                [
                            "Pokemon Video Pak 1",
                            {
                                "lineskip":false,
                                "speedhack":true
                            }
                ],
            "sonicpinball":
                [
                            "Sonic Pinball",
                            {
                                "lineskip":false,
                                "speedhack":false
                            }
                ]
};
var Iodine = null;
var Blitter = null;
var Mixer = null;
var MixerInput = null;
var timerID = null;
window.onload = function () {
    //Initialize Iodine:
    Iodine = new GameBoyAdvanceEmulator();
    //Initialize the graphics:
    registerBlitterHandler();
    //Initialize the audio:
    registerAudioHandler();
    //Register the save handler callbacks:
    registerSaveHandlers();
    //Hook the GUI controls.
    registerGUIEvents();
    //Enable Sound:
    Iodine.enableAudio();
    //Download the BIOS:
    downloadBIOS();
}
function downloadBIOS() {
    downloadFile("Binaries/gba_bios.bin", registerBIOS);
}
function registerBIOS() {
    processDownload(this, attachBIOS);
    downloadROM(location.hash.substr(1));
}
function downloadROM(gamename) {
    var game = games[gamename];
    Iodine.pause();
    showTempString("Downloading \"" + game[0] + ".\"");
    downloadFile("Binaries/" + gamename + ".gba", registerROM);
    setPreference(game[1]);
}
function setPreference(prefObj) {
    Iodine.toggleLineSkip(prefObj.lineskip);
    Iodine.toggleSlowDownBusHack(prefObj.speedhack);
}
function registerROM() {
    clearTempString();
    processDownload(this, attachROM);
    if (navigator.userAgent.match(/iPhone/i) || navigator.userAgent.match(/iPod/i) || navigator.userAgent.match(/iPad/i)) {
        Iodine.disableAudio();
    }
    Iodine.play();
}
function registerBlitterHandler() {
    Blitter = new GlueCodeGfx();
    Blitter.attachCanvas(document.getElementById("emulator_target"));
    Blitter.setSmoothScaling(false);
    Iodine.attachGraphicsFrameHandler(function (buffer) {Blitter.copyBuffer(buffer);});
}
function registerAudioHandler() {
    Mixer = new GlueCodeMixer();
    MixerInput = new GlueCodeMixerInput(Mixer);
    Iodine.attachAudioHandler(MixerInput);
}
function registerGUIEvents() {
    addEvent("keydown", document, keyDown);
    addEvent("keyup", document, keyUpPreprocess);
    addEvent("unload", document, ExportSave);
    setInterval(function () {
        document.title = games[location.hash.substr(1)][0] + " - " + Iodine.getSpeedPercentage();
    },500);
}
function lowerVolume() {
    var emuVolume = Math.max(Iodine.getVolume() - 0.04, 0);
    Iodine.changeVolume(emuVolume);
}
function raiseVolume() {
    var emuVolume = Math.min(Iodine.getVolume() + 0.04, 1);
    Iodine.changeVolume(emuVolume);
}
function writeRedTemporaryText(textString) {
    if (timerID) {
        clearTimeout(timerID);
    }
    showTempString(textString);
    timerID = setTimeout(clearTempString, 5000);
}
function showTempString(textString) {
    document.getElementById("tempMessage").style.display = "block";
    document.getElementById("tempMessage").textContent = textString;
}
function clearTempString() {
    document.getElementById("tempMessage").style.display = "none";
}
//Some wrappers and extensions for non-DOM3 browsers:
function addEvent(sEvent, oElement, fListener) {
    try {    
        oElement.addEventListener(sEvent, fListener, false);
    }
    catch (error) {
        oElement.attachEvent("on" + sEvent, fListener);    //Pity for IE.
    }
}
function removeEvent(sEvent, oElement, fListener) {
    try {    
        oElement.removeEventListener(sEvent, fListener, false);
    }
    catch (error) {
        oElement.detachEvent("on" + sEvent, fListener);    //Pity for IE.
    }
}
