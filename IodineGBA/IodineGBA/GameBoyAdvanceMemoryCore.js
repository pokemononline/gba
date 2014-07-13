"use strict";
/*
 * This file is part of IodineGBA
 *
 * Copyright (C) 2012-2014 Grant Galitz
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
function GameBoyAdvanceMemory(IOCore) {
    //Reference to the emulator core:
    this.IOCore = IOCore;
    //WRAM Map Control Stuff:
    this.WRAMControlFlags = 0x20;
    //Load the BIOS:
    this.BIOS = getUint8Array(0x4000);
    this.BIOS16 = getUint16View(this.BIOS);
    this.BIOS32 = getInt32View(this.BIOS);
    this.loadBIOS();
    //Initialize Some RAM:
    this.externalRAM = getUint8Array(0x40000);
    this.externalRAM16 = getUint16View(this.externalRAM);
    this.externalRAM32 = getInt32View(this.externalRAM);
    this.internalRAM = getUint8Array(0x8000);
    this.internalRAM16 = getUint16View(this.internalRAM);
    this.internalRAM32 = getInt32View(this.internalRAM);
    this.lastBIOSREAD = 0;        //BIOS read bus last.
    //After all sub-objects initialized, initialize dispatches:
    var generator = new GameBoyAdvanceMemoryDispatchGenerator(this);
    this.readIO8 = generator.generateMemoryReadIO8();
    this.readIO16 = generator.generateMemoryReadIO16();
    this.readIO32 = generator.generateMemoryReadIO32();
    this.writeIO8 = generator.generateMemoryWriteIO8();
    this.writeIO16 = generator.generateMemoryWriteIO16();
    this.writeIO32 = generator.generateMemoryWriteIO32();
    this.memoryReader8 = this.memoryReader8Generated[1];
    this.memoryWriter8 = this.memoryWriter8Generated[1];
    this.memoryReader16 = this.memoryReader16Generated[1];
    this.memoryReader16CPU = this.memoryReader16CPUGenerated[1];
    this.memoryWriter16 = this.memoryWriter16Generated[1];
    this.memoryReader32 = this.memoryReader32Generated[1];
    this.memoryReader32CPU = this.memoryReader32CPUGenerated[1];
    this.memoryWriter32 = this.memoryWriter32Generated[1];
}
GameBoyAdvanceMemory.prototype.loadReferences = function () {
    //Initialize the various handler objects:
    this.dma = this.IOCore.dma;
    this.gfx = this.IOCore.gfx;
    this.sound = this.IOCore.sound;
    this.timer = this.IOCore.timer;
    this.irq = this.IOCore.irq;
    this.serial = this.IOCore.serial;
    this.joypad = this.IOCore.joypad;
    this.cartridge = this.IOCore.cartridge;
    this.wait = this.IOCore.wait;
    this.cpu = this.IOCore.cpu;
    this.saves = this.IOCore.saves;
}
GameBoyAdvanceMemory.prototype.memoryWriteFast8 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.memoryWriter8(address | 0, data & 0xFF);
}
GameBoyAdvanceMemory.prototype.memoryWrite16 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.memoryWriter16(address & -2, data & 0xFFFF);
}
GameBoyAdvanceMemory.prototype.memoryWriteFast16 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.memoryWriter16(address | 0, data & 0xFFFF);
}
GameBoyAdvanceMemory.prototype.memoryWrite32 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.memoryWriter32(address & -4, data | 0);
}
GameBoyAdvanceMemory.prototype.memoryWriteFast32 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.memoryWriter32(address | 0, data | 0);
}
GameBoyAdvanceMemory.prototype.memoryReadFast8 = function (address) {
    address = address | 0;
    return this.memoryReader8(address | 0) & 0xFF;
}
GameBoyAdvanceMemory.prototype.memoryRead16 = function (address) {
    address = address | 0;
    return this.memoryReader16(address & -2) & 0xFFFF;
}
GameBoyAdvanceMemory.prototype.memoryReadFast16 = function (address) {
    address = address | 0;
    return this.memoryReader16(address | 0) & 0xFFFF;
}
GameBoyAdvanceMemory.prototype.memoryReadCPU16 = function (address) {
    address = address | 0;
    return this.memoryReader16CPU(address | 0) & 0xFFFF;
}
GameBoyAdvanceMemory.prototype.memoryRead32 = function (address) {
    address = address | 0;
    return this.memoryReader32(address & -4) | 0;
}
GameBoyAdvanceMemory.prototype.memoryReadFast32 = function (address) {
    address = address | 0;
    return this.memoryReader32(address | 0) | 0;
}
GameBoyAdvanceMemory.prototype.memoryReadCPU32 = function (address) {
    address = address | 0;
    return this.memoryReader32CPU(address | 0) | 0;
}
GameBoyAdvanceMemory.prototype.writeExternalWRAM8 = function (address, data) {
    address = address | 0;
    data = data | 0;
    //External WRAM:
    this.wait.WRAMAccess();
    this.externalRAM[address & 0x3FFFF] = data | 0;
}
if (__LITTLE_ENDIAN__) {
    GameBoyAdvanceMemory.prototype.writeExternalWRAM16 = function (address, data) {
        address = address | 0;
        data = data | 0;
        //External WRAM:
        this.wait.WRAMAccess();
        this.externalRAM16[(address >> 1) & 0x1FFFF] = data | 0;
    }
    GameBoyAdvanceMemory.prototype.writeExternalWRAM32 = function (address, data) {
        address = address | 0;
        data = data | 0;
        //External WRAM:
        this.wait.WRAMAccess32();
        this.externalRAM32[(address >> 2) & 0xFFFF] = data | 0;
    }
}
else {
    GameBoyAdvanceMemory.prototype.writeExternalWRAM16 = function (address, data) {
        //External WRAM:
        this.wait.WRAMAccess();
        this.externalRAM[address & 0x3FFFF] = data & 0xFF;
        this.externalRAM[(address + 1) & 0x3FFFF] = data >> 8;
    }
    GameBoyAdvanceMemory.prototype.writeExternalWRAM32 = function (address, data) {
        //External WRAM:
        this.wait.WRAMAccess32();
        this.externalRAM[address & 0x3FFFF] = data & 0xFF;
        this.externalRAM[(address + 1) & 0x3FFFF] = (data >> 8) & 0xFF;
        this.externalRAM[(address + 2) & 0x3FFFF] = (data >> 16) & 0xFF;
        this.externalRAM[(address + 3) & 0x3FFFF] = data >>> 24;
    }
}
GameBoyAdvanceMemory.prototype.writeInternalWRAM8 = function (address, data) {
    address = address | 0;
    data = data | 0;
    //Internal WRAM:
    this.wait.singleClock();
    this.internalRAM[address & 0x7FFF] = data | 0;
}
if (__LITTLE_ENDIAN__) {
    GameBoyAdvanceMemory.prototype.writeInternalWRAM16 = function (address, data) {
        address = address | 0;
        data = data | 0;
        //Internal WRAM:
        this.wait.singleClock();
        this.internalRAM16[(address >> 1) & 0x3FFF] = data | 0;
    }
    GameBoyAdvanceMemory.prototype.writeInternalWRAM32 = function (address, data) {
        address = address | 0;
        data = data | 0;
        //Internal WRAM:
        this.wait.singleClock();
        this.internalRAM32[(address >> 2) & 0x1FFF] = data | 0;
    }
}
else {
    GameBoyAdvanceMemory.prototype.writeInternalWRAM16 = function (address, data) {
        //Internal WRAM:
        this.wait.singleClock();
        this.internalRAM[address & 0x7FFF] = data & 0xFF;
        this.internalRAM[(address + 1) & 0x7FFF] = data >> 8;
    }
    GameBoyAdvanceMemory.prototype.writeInternalWRAM32 = function (address, data) {
        //Internal WRAM:
        this.wait.singleClock();
        this.internalRAM[address & 0x7FFF] = data & 0xFF;
        this.internalRAM[(address + 1) & 0x7FFF] = (data >> 8) & 0xFF;
        this.internalRAM[(address + 2) & 0x7FFF] = (data >> 16) & 0xFF;
        this.internalRAM[(address + 3) & 0x7FFF] = data >>> 24;
    }
}
GameBoyAdvanceMemory.prototype.writeIODispatch8 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.wait.singleClock();
    if ((address | 0) < 0x4000302) {
        //IO Write:
        this.writeIO8[address & 0x3FF](this, data | 0);
    }
    else if ((address & 0x4000800) == 0x4000800) {
        //WRAM wait state control:
        this.wait.writeConfigureWRAM8(address | 0, data | 0);
    }
}
GameBoyAdvanceMemory.prototype.writeIODispatch16 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.wait.singleClock();
    if ((address | 0) < 0x4000301) {
        //IO Write:
        address = address >> 1;
        this.writeIO16[address & 0x1FF](this, data | 0);
    }
    else if ((address & 0x4000800) == 0x4000800) {
        //WRAM wait state control:
        this.wait.writeConfigureWRAM16(address | 0, data | 0);
    }
}
GameBoyAdvanceMemory.prototype.writeIODispatch32 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.wait.singleClock();
    if ((address | 0) < 0x4000301) {
        //IO Write:
        address = address >> 2;
        this.writeIO32[address & 0xFF](this, data | 0);
    }
    else if ((address & 0x4000800) == 0x4000800) {
        //WRAM wait state control:
        this.wait.writeConfigureWRAM32(data | 0);
    }
}
if (!!Math.imul) {
    //Math.imul found, insert the optimized path in:
    GameBoyAdvanceMemory.prototype.writeVRAM8 = function (address, data) {
        address = address | 0;
        data = data | 0;
        this.IOCore.updateGraphicsClocking();
        this.wait.VRAMAccess();
        if ((address & 0x10000) != 0) {
            if ((address & 0x17FFF) < 0x14000 && (this.gfx.BGMode | 0) >= 3) {
                this.gfx.writeVRAM16(address & 0x17FFE, Math.imul(data | 0, 0x101) | 0);
            }
        }
        else {
            this.gfx.writeVRAM16(address & 0xFFFE, Math.imul(data | 0, 0x101) | 0);
        }
    }
}
else {
    //Math.imul not found, use the compatibility method:
    GameBoyAdvanceMemory.prototype.writeVRAM8 = function (address, data) {
        address = address | 0;
        data = data | 0;
        this.IOCore.updateGraphicsClocking();
        this.wait.VRAMAccess();
        if ((address & 0x10000) != 0) {
            if ((address & 0x17FFF) < 0x14000 && (this.gfx.BGMode | 0) >= 3) {
                this.gfx.writeVRAM16(address & 0x17FFE, (data * 0x101) | 0);
            }
        }
        else {
            this.gfx.writeVRAM16(address & 0xFFFE, (data * 0x101) | 0);
        }
    }
}
GameBoyAdvanceMemory.prototype.writeVRAM16 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess();
    address = address & (((address & 0x10000) >> 1) ^ address);
    this.gfx.writeVRAM16(address & 0x1FFFE, data | 0);
}
GameBoyAdvanceMemory.prototype.writeVRAM32 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess32();
    address = address & (((address & 0x10000) >> 1) ^ address);
    this.gfx.writeVRAM32(address & 0x1FFFC, data | 0);
}
GameBoyAdvanceMemory.prototype.writeOAM8 = function (address, data) {
    this.IOCore.updateGraphicsClocking();
    this.wait.OAMAccess();
}
GameBoyAdvanceMemory.prototype.writeOAM16 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.OAMAccess();
    this.gfx.writeOAM16(address & 0x3FE, data | 0);
}
GameBoyAdvanceMemory.prototype.writeOAM32 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.OAMAccess();
    this.gfx.writeOAM32(address & 0x3FC, data | 0);
}
if (!!Math.imul) {
    //Math.imul found, insert the optimized path in:
    GameBoyAdvanceMemory.prototype.writePalette8 = function (address, data) {
        address = address | 0;
        data = data | 0;
        this.IOCore.updateGraphicsClocking();
        this.wait.VRAMAccess();
        this.gfx.writePalette16(address & 0x3FE, Math.imul(data | 0, 0x101) | 0);
    }
}
else {
    //Math.imul not found, use the compatibility method:
    GameBoyAdvanceMemory.prototype.writePalette8 = function (address, data) {
        address = address | 0;
        data = data | 0;
        this.IOCore.updateGraphicsClocking();
        this.wait.VRAMAccess();
        this.gfx.writePalette16(address & 0x3FE, (data * 0x101) | 0);
    }
}
GameBoyAdvanceMemory.prototype.writePalette16 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess();
    this.gfx.writePalette16(address & 0x3FE, data | 0);
}
GameBoyAdvanceMemory.prototype.writePalette32 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess32();
    this.gfx.writePalette32(address & 0x3FC, data | 0);
}
GameBoyAdvanceMemory.prototype.writeROM8 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.wait.ROMAccess(address | 0);
    this.cartridge.writeROM8(address & 0x1FFFFFF, data | 0);
}
GameBoyAdvanceMemory.prototype.writeROM16 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.wait.ROMAccess(address | 0);
    this.cartridge.writeROM16(address & 0x1FFFFFE, data | 0);
}
GameBoyAdvanceMemory.prototype.writeROM32 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.wait.ROMAccess32(address | 0);
    this.cartridge.writeROM32(address & 0x1FFFFFC, data | 0);
}
GameBoyAdvanceMemory.prototype.writeSRAM8 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.wait.SRAMAccess();
    this.saves.writeSRAM(address & 0xFFFF, data | 0);
}
GameBoyAdvanceMemory.prototype.writeSRAM16 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.wait.SRAMAccess();
    this.saves.writeSRAM(address & 0xFFFE, (data >> ((address & 0x1) << 3)) & 0xFF);
}
GameBoyAdvanceMemory.prototype.writeSRAM32 = function (address, data) {
    address = address | 0;
    data = data | 0;
    this.wait.SRAMAccess();
    this.saves.writeSRAM(address & 0xFFFC, (data >> ((address & 0x3) << 3)) & 0xFF);
}
GameBoyAdvanceMemory.prototype.NOP = function (parentObj, data) {
    //Ignore the data write...
}
GameBoyAdvanceMemory.prototype.writeUnused8 = function (address, data) {
    //Ignore the data write...
    this.wait.singleClock();
}
GameBoyAdvanceMemory.prototype.writeUnused16 = function (address, data) {
    //Ignore the data write...
    this.wait.singleClock();
}
GameBoyAdvanceMemory.prototype.writeUnused32 = function (address, data) {
    //Ignore the data write...
    this.wait.singleClock();
}
GameBoyAdvanceMemory.prototype.remapWRAM = function (data) {
    data = data & 0x21;
    if ((data | 0) != (this.WRAMControlFlags | 0)) {
        switch (data | 0) {
            case 0:
                //Mirror Internal RAM to External:
                this.memoryWriter8 = this.memoryWriter8Generated[0];
                this.memoryReader8 = this.memoryReader8Generated[0];
                this.memoryWriter16 = this.memoryWriter16Generated[0];
                this.memoryReader16 = this.memoryReader16Generated[0];
                this.memoryReader16CPU = this.memoryReader16CPUGenerated[0];
                this.memoryWriter32 = this.memoryWriter32Generated[0];
                this.memoryReader32 = this.memoryReader32Generated[0];
                this.memoryReader32CPU = this.memoryReader32CPUGenerated[0];
                break;
            case 0x20:
                //Use External RAM:
                this.memoryWriter8 = this.memoryWriter8Generated[1];
                this.memoryReader8 = this.memoryReader8Generated[1];
                this.memoryWriter16 = this.memoryWriter16Generated[1];
                this.memoryReader16 = this.memoryReader16Generated[1];
                this.memoryReader16CPU = this.memoryReader16CPUGenerated[1];
                this.memoryWriter32 = this.memoryWriter32Generated[1];
                this.memoryReader32 = this.memoryReader32Generated[1];
                this.memoryReader32CPU = this.memoryReader32CPUGenerated[1];
                break;
            default:
                this.memoryWriter8 = this.memoryWriter8Generated[2];
                this.memoryReader8 = this.memoryReader8Generated[2];
                this.memoryWriter16 = this.memoryWriter16Generated[2];
                this.memoryReader16 = this.memoryReader16Generated[2];
                this.memoryReader16CPU = this.memoryReader16CPUGenerated[2];
                this.memoryWriter32 = this.memoryWriter32Generated[2];
                this.memoryReader32 = this.memoryReader32Generated[2];
                this.memoryReader32CPU = this.memoryReader32CPUGenerated[2];
        }
        this.WRAMControlFlags = data | 0;
    }
}
GameBoyAdvanceMemory.prototype.readBIOS8 = function (address) {
    address = address | 0;
    var data = 0;
    if ((address | 0) < 0x4000) {
        this.wait.singleClock();
        if ((this.cpu.registers[15] | 0) < 0x4000) {
            //If reading from BIOS while executing it:
            data = this.BIOS[address & 0x3FFF] | 0;
        }
        else {
            //Not allowed to read from BIOS while executing outside of it:
            data = (this.lastBIOSREAD >> ((address & 0x3) << 3)) & 0xFF;
        }
    }
    else {
        data = this.readUnused8(address | 0) | 0;
    }
    return data | 0;
}
if (__LITTLE_ENDIAN__) {
    GameBoyAdvanceMemory.prototype.readBIOS16 = function (address) {
        address = address | 0;
        var data = 0;
        if ((address | 0) < 0x4000) {
            address >>= 1;
            this.wait.singleClock();
            if ((this.cpu.registers[15] | 0) < 0x4000) {
                //If reading from BIOS while executing it:
                data = this.BIOS16[address & 0x1FFF] | 0;
            }
            else {
                //Not allowed to read from BIOS while executing outside of it:
                data = (this.lastBIOSREAD >> ((address & 0x1) << 4)) & 0xFFFF;
            }
        }
        else {
            data = this.readUnused16(address | 0) | 0;
        }
        return data | 0;
    }
    GameBoyAdvanceMemory.prototype.readBIOS16CPU = function (address) {
        address = address | 0;
        var data = 0;
        if ((address | 0) < 0x4000) {
            address >>= 1;
            this.IOCore.updateCoreSingle();
            //If reading from BIOS while executing it:
            data = this.BIOS16[address & 0x1FFF] | 0;
            this.lastBIOSREAD = data | 0;
        }
        else {
            data = this.readUnused16CPU(address | 0) | 0;
        }
        return data | 0;
    }
    GameBoyAdvanceMemory.prototype.readBIOS32 = function (address) {
        address = address | 0;
        var data = 0;
        if ((address | 0) < 0x4000) {
            address >>= 2;
            this.wait.singleClock();
            if ((this.cpu.registers[15] | 0) < 0x4000) {
                //If reading from BIOS while executing it:
                data = this.BIOS32[address & 0xFFF] | 0;
            }
            else {
                //Not allowed to read from BIOS while executing outside of it:
                data = this.lastBIOSREAD | 0;
            }
        }
        else {
            data = this.readUnused32(address | 0) | 0;
        }
        return data | 0;
    }
    GameBoyAdvanceMemory.prototype.readBIOS32CPU = function (address) {
        address = address | 0;
        var data = 0;
        if ((address | 0) < 0x4000) {
            address >>= 2;
            this.IOCore.updateCoreSingle();
            //If reading from BIOS while executing it:
            data = this.BIOS32[address & 0xFFF] | 0;
            this.lastBIOSREAD = data | 0;
        }
        else {
            data = this.readUnused32CPU(address | 0) | 0;
        }
        return data | 0;
    }
}
else {
    GameBoyAdvanceMemory.prototype.readBIOS16 = function (address) {
        if (address < 0x4000) {
            this.wait.singleClock();
            if (this.cpu.registers[15] < 0x4000) {
                //If reading from BIOS while executing it:
                return this.BIOS[address] | (this.BIOS[address | 1] << 8);
            }
            else {
                //Not allowed to read from BIOS while executing outside of it:
                return (this.lastBIOSREAD >> ((address & 0x2) << 3)) & 0xFFFF;
            }
        }
        else {
            return this.readUnused16(address);
        }
    }
    GameBoyAdvanceMemory.prototype.readBIOS16CPU = function (address) {
        if (address < 0x4000) {
            this.IOCore.updateCoreSingle();
            //If reading from BIOS while executing it:
            var data = this.BIOS[address] | (this.BIOS[address | 1] << 8);
            this.lastBIOSREAD = data;
            return data;
        }
        else {
            return this.readUnused16CPU(address);
        }
    }
    GameBoyAdvanceMemory.prototype.readBIOS32 = function (address) {
        if (address < 0x4000) {
            this.wait.singleClock();
            if (this.cpu.registers[15] < 0x4000) {
                //If reading from BIOS while executing it:
                return this.BIOS[address] | (this.BIOS[address | 1] << 8) | (this.BIOS[address | 2] << 16)  | (this.BIOS[address | 3] << 24);
            }
            else {
                //Not allowed to read from BIOS while executing outside of it:
                return this.lastBIOSREAD;
            }
        }
        else {
            return this.readUnused32(address);
        }
    }
    GameBoyAdvanceMemory.prototype.readBIOS32CPU = function (address) {
        if (address < 0x4000) {
            this.IOCore.updateCoreSingle();
            //If reading from BIOS while executing it:
            var data = this.BIOS[address] | (this.BIOS[address | 1] << 8) | (this.BIOS[address | 2] << 16)  | (this.BIOS[address | 3] << 24);
            this.lastBIOSREAD = data;
            return data;
        }
        else {
            return this.readUnused32CPU(address);
        }
    }
}
GameBoyAdvanceMemory.prototype.readExternalWRAM8 = function (address) {
    address = address | 0;
    //External WRAM:
    this.wait.WRAMAccess();
    return this.externalRAM[address & 0x3FFFF] | 0;
}
if (__LITTLE_ENDIAN__) {
    GameBoyAdvanceMemory.prototype.readExternalWRAM16 = function (address) {
        address = address | 0;
        //External WRAM:
        this.wait.WRAMAccess();
        return this.externalRAM16[(address >> 1) & 0x1FFFF] | 0;
    }
    GameBoyAdvanceMemory.prototype.readExternalWRAM16CPU = function (address) {
        address = address | 0;
        //External WRAM:
        this.wait.WRAMAccess16CPU();
        return this.externalRAM16[(address >> 1) & 0x1FFFF] | 0;
    }
    GameBoyAdvanceMemory.prototype.readExternalWRAM32 = function (address) {
        address = address | 0;
        //External WRAM:
        this.wait.WRAMAccess32();
        return this.externalRAM32[(address >> 2) & 0xFFFF] | 0;
    }
    GameBoyAdvanceMemory.prototype.readExternalWRAM32CPU = function (address) {
        address = address | 0;
        //External WRAM:
        this.wait.WRAMAccess32CPU();
        return this.externalRAM32[(address >> 2) & 0xFFFF] | 0;
    }
}
else {
    GameBoyAdvanceMemory.prototype.readExternalWRAM16 = function (address) {
        //External WRAM:
        this.wait.WRAMAccess();
        return this.externalRAM[address & 0x3FFFE] | (this.externalRAM[(address | 1) & 0x3FFFF] << 8);
    }
    GameBoyAdvanceMemory.prototype.readExternalWRAM16CPU = function (address) {
        //External WRAM:
        this.wait.WRAMAccess16CPU();
        return this.externalRAM[address & 0x3FFFE] | (this.externalRAM[(address | 1) & 0x3FFFF] << 8);
    }
    GameBoyAdvanceMemory.prototype.readExternalWRAM32 = function (address) {
        //External WRAM:
        this.wait.WRAMAccess32();
        return this.externalRAM[address & 0x3FFFC] | (this.externalRAM[(address | 1) & 0x3FFFD] << 8) | (this.externalRAM[(address | 2) & 0x3FFFE] << 16) | (this.externalRAM[(address | 3) & 0x3FFFF] << 24);
    }
    GameBoyAdvanceMemory.prototype.readExternalWRAM32CPU = function (address) {
        //External WRAM:
        this.wait.WRAMAccess32CPU();
        return this.externalRAM[address & 0x3FFFC] | (this.externalRAM[(address | 1) & 0x3FFFD] << 8) | (this.externalRAM[(address | 2) & 0x3FFFE] << 16) | (this.externalRAM[(address | 3) & 0x3FFFF] << 24);
    }
}
GameBoyAdvanceMemory.prototype.readInternalWRAM8 = function (address) {
    address = address | 0;
    //Internal WRAM:
    this.wait.singleClock();
    return this.internalRAM[address & 0x7FFF] | 0;
}
if (__LITTLE_ENDIAN__) {
    GameBoyAdvanceMemory.prototype.readInternalWRAM16 = function (address) {
        address = address | 0;
        //Internal WRAM:
        this.wait.singleClock();
        return this.internalRAM16[(address >> 1) & 0x3FFF] | 0;
    }
    GameBoyAdvanceMemory.prototype.readInternalWRAM16CPU = function (address) {
        address = address | 0;
        //Internal WRAM:
        this.IOCore.updateCoreSingle();
        return this.internalRAM16[(address >> 1) & 0x3FFF] | 0;
    }
    GameBoyAdvanceMemory.prototype.readInternalWRAM32 = function (address) {
        address = address | 0;
        //Internal WRAM:
        this.wait.singleClock();
        return this.internalRAM32[(address >> 2) & 0x1FFF] | 0;
    }
    GameBoyAdvanceMemory.prototype.readInternalWRAM32CPU = function (address) {
        address = address | 0;
        //Internal WRAM:
        this.IOCore.updateCoreSingle();
        return this.internalRAM32[(address >> 2) & 0x1FFF] | 0;
    }
}
else {
    GameBoyAdvanceMemory.prototype.readInternalWRAM16 = function (address) {
        //Internal WRAM:
        this.wait.singleClock();
        return this.internalRAM[address & 0x7FFE] | (this.internalRAM[(address | 1) & 0x7FFF] << 8);
    }
    GameBoyAdvanceMemory.prototype.readInternalWRAM16CPU = function (address) {
        //Internal WRAM:
        this.IOCore.updateCoreSingle();
        return this.internalRAM[address & 0x7FFE] | (this.internalRAM[(address | 1) & 0x7FFF] << 8);
    }
    GameBoyAdvanceMemory.prototype.readInternalWRAM32 = function (address) {
        //Internal WRAM:
        this.wait.singleClock();
        return this.internalRAM[address & 0x7FFC] | (this.internalRAM[(address | 1) & 0x7FFD] << 8) | (this.internalRAM[(address | 2) & 0x7FFE] << 16) | (this.internalRAM[(address | 3) & 0x7FFF] << 24);
    }
    GameBoyAdvanceMemory.prototype.readInternalWRAM32CPU = function (address) {
        //Internal WRAM:
        this.IOCore.updateCoreSingle();
        return this.internalRAM[address & 0x7FFC] | (this.internalRAM[(address | 1) & 0x7FFD] << 8) | (this.internalRAM[(address | 2) & 0x7FFE] << 16) | (this.internalRAM[(address | 3) & 0x7FFF] << 24);
    }
}
GameBoyAdvanceMemory.prototype.readIODispatch8 = function (address) {
    address = address | 0;
    var data = 0;
    if ((address | 0) < 0x4000304) {
        //IO Read:
        this.wait.singleClock();
        data = this.readIO8[address & 0x3FF](this) | 0;
    }
    else if ((address & 0x4000800) == 0x4000800) {
        //WRAM wait state control:
        this.wait.singleClock();
        data = this.wait.readConfigureWRAM8(address | 0) | 0;
    }
    else {
        data = this.readUnused8(address | 0) | 0;
    }
    return data | 0;
}
GameBoyAdvanceMemory.prototype.readIODispatch16 = function (address) {
    address = address | 0;
    var data = 0;
    if ((address | 0) < 0x4000303) {
        //IO Read:
        this.wait.singleClock();
        address >>= 1;
        data = this.readIO16[address & 0x1FF](this) | 0;
    }
    else if ((address & 0x4000800) == 0x4000800) {
        //WRAM wait state control:
        this.wait.singleClock();
        data = this.wait.readConfigureWRAM16(address | 0) | 0;
    }
    else {
        data = this.readUnused16(address | 0) | 0;
    }
    return data | 0;
}
GameBoyAdvanceMemory.prototype.readIODispatch16CPU = function (address) {
    address = address | 0;
    var data = 0;
    if ((address | 0) < 0x4000303) {
        //IO Read:
        this.IOCore.updateCoreSingle();
        address >>= 1;
        data = this.readIO16[address & 0x1FF](this) | 0;
    }
    else if ((address & 0x4000800) == 0x4000800) {
        //WRAM wait state control:
        this.IOCore.updateCoreSingle();
        data = this.wait.readConfigureWRAM16(address | 0) | 0;
    }
    else {
        data = this.readUnused16CPU(address | 0) | 0;
    }
    return data | 0;
}
GameBoyAdvanceMemory.prototype.readIODispatch32 = function (address) {
    address = address | 0;
    var data = 0;
    if ((address | 0) < 0x4000301) {
        //IO Read:
        this.wait.singleClock();
        address >>= 2;
        data = this.readIO32[address & 0xFF](this) | 0;
    }
    else if ((address & 0x4000800) == 0x4000800) {
        //WRAM wait state control:
        this.wait.singleClock();
        data = this.wait.readConfigureWRAM32() | 0;
    }
    else {
        data = this.readUnused32(address | 0) | 0;
    }
    return data | 0;
}
GameBoyAdvanceMemory.prototype.readIODispatch32CPU = function (address) {
    address = address | 0;
    var data = 0;
    if ((address | 0) < 0x4000301) {
        //IO Read:
        this.IOCore.updateCoreSingle();
        address >>= 2;
        data = this.readIO32[address & 0xFF](this) | 0;
    }
    else if ((address & 0x4000800) == 0x4000800) {
        //WRAM wait state control:
        this.IOCore.updateCoreSingle();
        data = this.wait.readConfigureWRAM32() | 0;
    }
    else {
        data = this.readUnused32CPU(address | 0) | 0;
    }
    return data | 0;
}
GameBoyAdvanceMemory.prototype.readVRAM8 = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess();
    address = address & (((address & 0x10000) >> 1) ^ address);
    return this.gfx.readVRAM(address & 0x1FFFF) | 0;
}
GameBoyAdvanceMemory.prototype.readVRAM16 = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess();
    address = address & (((address & 0x10000) >> 1) ^ address);
    return this.gfx.readVRAM16(address & 0x1FFFE) | 0;
}
GameBoyAdvanceMemory.prototype.readVRAM16CPU = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess();
    address = address & (((address & 0x10000) >> 1) ^ address);
    return this.gfx.readVRAM16(address & 0x1FFFE) | 0;
}
GameBoyAdvanceMemory.prototype.readVRAM32 = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess32();
    address = address & (((address & 0x10000) >> 1) ^ address);
    return this.gfx.readVRAM32(address & 0x1FFFC) | 0;
}
GameBoyAdvanceMemory.prototype.readVRAM32CPU = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess32CPU();
    address = address & (((address & 0x10000) >> 1) ^ address);
    return this.gfx.readVRAM32(address & 0x1FFFC) | 0;
}
GameBoyAdvanceMemory.prototype.readOAM8 = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.OAMAccess();
    return this.gfx.readOAM(address & 0x3FF) | 0;
}
GameBoyAdvanceMemory.prototype.readOAM16 = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.OAMAccess();
    return this.gfx.readOAM16(address & 0x3FE) | 0;
}
GameBoyAdvanceMemory.prototype.readOAM16CPU = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.OAMAccessCPU();
    return this.gfx.readOAM16(address & 0x3FE) | 0;
}
GameBoyAdvanceMemory.prototype.readOAM32 = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.OAMAccess();
    return this.gfx.readOAM32(address & 0x3FC) | 0;
}
GameBoyAdvanceMemory.prototype.readOAM32CPU = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.OAMAccessCPU();
    return this.gfx.readOAM32(address & 0x3FC) | 0;
}
GameBoyAdvanceMemory.prototype.readPalette8 = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess();
    return this.gfx.readPalette(address & 0x3FF);
}
GameBoyAdvanceMemory.prototype.readPalette16 = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess();
    return this.gfx.readPalette16(address & 0x3FE);
}
GameBoyAdvanceMemory.prototype.readPalette16CPU = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess16CPU();
    return this.gfx.readPalette16(address & 0x3FE);
}
GameBoyAdvanceMemory.prototype.readPalette32 = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess32();
    return this.gfx.readPalette32(address & 0x3FC);
}
GameBoyAdvanceMemory.prototype.readPalette32CPU = function (address) {
    address = address | 0;
    this.IOCore.updateGraphicsClocking();
    this.wait.VRAMAccess32CPU();
    return this.gfx.readPalette32(address & 0x3FC);
}
GameBoyAdvanceMemory.prototype.readROM8 = function (address) {
    address = address | 0;
    this.wait.ROMAccess(address | 0);
    return this.cartridge.readROM8(address & 0x1FFFFFF) | 0;
}
GameBoyAdvanceMemory.prototype.readROM16 = function (address) {
    address = address | 0;
    this.wait.ROMAccess(address | 0);
    return this.cartridge.readROM16(address & 0x1FFFFFE) | 0;
}
GameBoyAdvanceMemory.prototype.readROM16CPU = function (address) {
    address = address | 0;
    this.wait.ROMAccess16CPU(address | 0);
    return this.cartridge.readROM16(address & 0x1FFFFFE) | 0;
}
GameBoyAdvanceMemory.prototype.readROM32 = function (address) {
    address = address | 0;
    this.wait.ROMAccess32(address | 0);
    return this.cartridge.readROM32(address & 0x1FFFFFC) | 0;
}
GameBoyAdvanceMemory.prototype.readROM32CPU = function (address) {
    address = address | 0;
    this.wait.ROMAccess32CPU(address | 0);
    return this.cartridge.readROM32(address & 0x1FFFFFC) | 0;
}
GameBoyAdvanceMemory.prototype.readROM28 = function (address) {
    address = address | 0;
    this.wait.ROMAccess(address | 0);
    return this.cartridge.readROM8Space2(address & 0x1FFFFFF) | 0;
}
GameBoyAdvanceMemory.prototype.readROM216 = function (address) {
    address = address | 0;
    this.wait.ROMAccess(address | 0);
    return this.cartridge.readROM16Space2(address & 0x1FFFFFE) | 0;
}
GameBoyAdvanceMemory.prototype.readROM216CPU = function (address) {
    address = address | 0;
    this.wait.ROMAccess16CPU(address | 0);
    return this.cartridge.readROM16Space2(address & 0x1FFFFFE) | 0;
}
GameBoyAdvanceMemory.prototype.readROM232 = function (address) {
    address = address | 0;
    this.wait.ROMAccess32(address | 0);
    return this.cartridge.readROM32Space2(address & 0x1FFFFFC) | 0;
}
GameBoyAdvanceMemory.prototype.readROM232CPU = function (address) {
    address = address | 0;
    this.wait.ROMAccess32CPU(address | 0);
    return this.cartridge.readROM32Space2(address & 0x1FFFFFC) | 0;
}
GameBoyAdvanceMemory.prototype.readSRAM8 = function (address) {
    address = address | 0;
    this.wait.SRAMAccess();
    return this.saves.readSRAM(address & 0xFFFF) | 0;
}
if (!!Math.imul) {
    //Math.imul found, insert the optimized path in:
    GameBoyAdvanceMemory.prototype.readSRAM16 = function (address) {
        address = address | 0;
        this.wait.SRAMAccess();
        return Math.imul(this.saves.readSRAM(address & 0xFFFE) | 0, 0x101) | 0;
    }
    GameBoyAdvanceMemory.prototype.readSRAM16CPU = function (address) {
        address = address | 0;
        this.wait.SRAMAccessCPU();
        return Math.imul(this.saves.readSRAM(address & 0xFFFE) | 0, 0x101) | 0;
    }
    GameBoyAdvanceMemory.prototype.readSRAM32 = function (address) {
        address = address | 0;
        this.wait.SRAMAccess();
        return Math.imul(this.saves.readSRAM(address & 0xFFFC) | 0, 0x1010101) | 0;
    }
    GameBoyAdvanceMemory.prototype.readSRAM32CPU = function (address) {
        address = address | 0;
        this.wait.SRAMAccessCPU();
        return Math.imul(this.saves.readSRAM(address & 0xFFFC) | 0, 0x1010101) | 0;
    }
}
else {
    //Math.imul not found, use the compatibility method:
    GameBoyAdvanceMemory.prototype.readSRAM16 = function (address) {
        address = address | 0;
        this.wait.SRAMAccess();
        return ((this.saves.readSRAM(address & 0xFFFE) | 0) * 0x101) | 0;
    }
    GameBoyAdvanceMemory.prototype.readSRAM16CPU = function (address) {
        address = address | 0;
        this.wait.SRAMAccessCPU();
        return ((this.saves.readSRAM(address & 0xFFFE) | 0) * 0x101) | 0;
    }
    GameBoyAdvanceMemory.prototype.readSRAM32 = function (address) {
        address = address | 0;
        this.wait.SRAMAccess();
        return ((this.saves.readSRAM(address & 0xFFFC) | 0) * 0x1010101) | 0;
    }
    GameBoyAdvanceMemory.prototype.readSRAM32CPU = function (address) {
        address = address | 0;
        this.wait.SRAMAccessCPU();
        return ((this.saves.readSRAM(address & 0xFFFC) | 0) * 0x1010101) | 0;
    }
}
GameBoyAdvanceMemory.prototype.readZero = function (parentObj) {
    return 0;
}
GameBoyAdvanceMemory.prototype.readUnused8 = function (address) {
    address = address | 0;
    this.wait.singleClock();
    var controller = ((this.IOCore.systemStatus & 0x8) == 0) ? this.cpu : this.dma;
    return (controller.getCurrentFetchValue() >> ((address & 0x3) << 3)) & 0xFF;
}
GameBoyAdvanceMemory.prototype.readUnused16IO1 = function (parentObj) {
    parentObj.IOCore.updateCoreSingle();
    var controller = ((parentObj.IOCore.systemStatus & 0x8) == 0) ? parentObj.cpu : parentObj.dma;
    return controller.getCurrentFetchValue() & 0xFFFF;
}
GameBoyAdvanceMemory.prototype.readUnused16IO2 = function (parentObj) {
    parentObj.IOCore.updateCoreSingle();
    var controller = ((parentObj.IOCore.systemStatus & 0x8) == 0) ? parentObj.cpu : parentObj.dma;
    return (controller.getCurrentFetchValue() >> 16) & 0xFFFF;
}
GameBoyAdvanceMemory.prototype.readUnused16 = function (address) {
    address = address | 0;
    this.wait.singleClock();
    var controller = ((this.IOCore.systemStatus & 0x8) == 0) ? this.cpu : this.dma;
    return (controller.getCurrentFetchValue() >> ((address & 0x2) << 3)) & 0xFFFF;
}
GameBoyAdvanceMemory.prototype.readUnused16CPU = function (address) {
    address = address | 0;
    this.IOCore.updateCoreSingle();
    var controller = ((this.IOCore.systemStatus & 0x8) == 0) ? this.cpu : this.dma;
    return (controller.getCurrentFetchValue() >> ((address & 0x2) << 3)) & 0xFFFF;
}
GameBoyAdvanceMemory.prototype.readUnused32IO = function (parentObj) {
    parentObj.IOCore.updateCoreSingle();
    var controller = ((parentObj.IOCore.systemStatus & 0x8) == 0) ? parentObj.cpu : parentObj.dma;
    return controller.getCurrentFetchValue() | 0;
}
GameBoyAdvanceMemory.prototype.readUnused32 = function (address) {
    address = address | 0;
    this.wait.singleClock();
    var controller = ((this.IOCore.systemStatus & 0x8) == 0) ? this.cpu : this.dma;
    return controller.getCurrentFetchValue() | 0;
}
GameBoyAdvanceMemory.prototype.readUnused32CPU = function (address) {
    address = address | 0;
    this.IOCore.updateCoreSingle();
    var controller = ((this.IOCore.systemStatus & 0x8) == 0) ? this.cpu : this.dma;
    return controller.getCurrentFetchValue() | 0;
}
GameBoyAdvanceMemory.prototype.readUnused0 = function (parentObj) {
    var controller = ((parentObj.IOCore.systemStatus & 0x8) == 0) ? parentObj.cpu : parentObj.dma;
    return controller.getCurrentFetchValue() & 0xFF;
}
GameBoyAdvanceMemory.prototype.readUnused1 = function (parentObj) {
    var controller = ((parentObj.IOCore.systemStatus & 0x8) == 0) ? parentObj.cpu : parentObj.dma;
    return (controller.getCurrentFetchValue() >> 8) & 0xFF;
}
GameBoyAdvanceMemory.prototype.readUnused2 = function (parentObj) {
    var controller = ((parentObj.IOCore.systemStatus & 0x8) == 0) ? parentObj.cpu : parentObj.dma;
    return (controller.getCurrentFetchValue() >> 16) & 0xFF;
}
GameBoyAdvanceMemory.prototype.readUnused3 = function (parentObj) {
    var controller = ((parentObj.IOCore.systemStatus & 0x8) == 0) ? parentObj.cpu : parentObj.dma;
    return controller.getCurrentFetchValue() >>> 24;
}
GameBoyAdvanceMemory.prototype.loadBIOS = function () {
    //Ensure BIOS is of correct length:
    if ((this.IOCore.BIOS.length | 0) == 0x4000) {
        this.IOCore.BIOSFound = true;
        for (var index = 0; (index | 0) < 0x4000; index = ((index | 0) + 1) | 0) {
            this.BIOS[index & 0x3FFF] = this.IOCore.BIOS[index & 0x3FFF] & 0xFF;
        }
    }
    else {
        this.IOCore.BIOSFound = false;
    }
}
function generateMemoryTopLevelDispatch() {
    function compileMemoryReadDispatch(readCalls) {
        var readUnused = readCalls[0];
        var readExternalWRAM = readCalls[1];
        var readInternalWRAM = readCalls[2];
        var readIODispatch = readCalls[3];
        var readPalette = readCalls[4];
        var readVRAM = readCalls[5];
        var readOAM = readCalls[6];
        var readROM = readCalls[7];
        var readROM2 = readCalls[8];
        var readSRAM = readCalls[9];
        var readBIOS = readCalls[10];
        var code = "address = address | 0;var data = 0;switch (address >> 24) {";
        /*
         Decoder for the nibble at bits 24-27
         (Top 4 bits of the address falls through to default (unused),
         so the next nibble down is used for dispatch.):
         */
        /*
         BIOS Area (00000000-00003FFF)
         Unused (00004000-01FFFFFF)
         */
        code += "case 0:{data = this." + readBIOS + "(address | 0) | 0;break};";
        /*
         Unused (00004000-01FFFFFF)
         */
        /*
         WRAM - On-board Work RAM (02000000-0203FFFF)
         Unused (02040000-02FFFFFF)
         */
        code += "case 0x2:{data = this." + readExternalWRAM + "(address | 0) | 0;break};";
        /*
         WRAM - In-Chip Work RAM (03000000-03007FFF)
         Unused (03008000-03FFFFFF)
         */
        code += "case 0x3:{data = this." + readInternalWRAM + "(address | 0) | 0;break};";
        /*
         I/O Registers (04000000-040003FE)
         Unused (04000400-04FFFFFF)
         */
        code += "case 0x4:{data = this." + readIODispatch + "(address | 0) | 0;break};";
        /*
         BG/OBJ Palette RAM (05000000-050003FF)
         Unused (05000400-05FFFFFF)
         */
        code += "case 0x5:{data = this." + readPalette + "(address | 0) | 0;break};";
        /*
         VRAM - Video RAM (06000000-06017FFF)
         Unused (06018000-06FFFFFF)
         */
        code += "case 0x6:{data = this." + readVRAM + "(address | 0) | 0;break};";
        /*
         OAM - OBJ Attributes (07000000-070003FF)
         Unused (07000400-07FFFFFF)
         */
        code += "case 0x7:{data = this." + readOAM + "(address | 0) | 0;break};";
        /*
         Game Pak ROM (max 16MB) - Wait State 0 (08000000-08FFFFFF)
         */
        code += "case 0x8:";
        /*
         Game Pak ROM/FlashROM (max 16MB) - Wait State 0 (09000000-09FFFFFF)
         */
        code += "case 0x9:";
        /*
         Game Pak ROM (max 16MB) - Wait State 1 (0A000000-0AFFFFFF)
         */
        code += "case 0xA:";
        /*
         Game Pak ROM/FlashROM (max 16MB) - Wait State 1 (0B000000-0BFFFFFF)
         */
        code += "case 0xB:{data = this." + readROM + "(address | 0) | 0;break};";
        /*
         Game Pak ROM (max 16MB) - Wait State 2 (0C000000-0CFFFFFF)
         */
        code += "case 0xC:";
        /*
         Game Pak ROM/FlashROM (max 16MB) - Wait State 2 (0D000000-0DFFFFFF)
         */
        code += "case 0xD:{data = this." + readROM2 + "(address | 0) | 0;break};";
        /*
         Game Pak SRAM  (max 64 KBytes) - 8bit Bus width (0E000000-0E00FFFF)
         */
        code += "case 0xE:";
        /*
         Game Pak SRAM  (max 64 KBytes) - 8bit Bus width (0E000000-0E00FFFF)
         --UNDOCUMENTED MIRROR--
         */
        code += "case 0xF:{data = this." + readSRAM + "(address | 0) | 0;break};";
        /*
         Unused (0F000000-FFFFFFFF)
         */
        code += "default:{data = this." + readUnused + "(address | 0) | 0};";
        //Generate the function:
        code += "}return data | 0;";
        return Function("address", code);
    }
    function compileMemoryWriteDispatch(writeCalls) {
        var writeUnused = writeCalls[0];
        var writeExternalWRAM = writeCalls[1];
        var writeInternalWRAM = writeCalls[2];
        var writeIODispatch = writeCalls[3];
        var writePalette = writeCalls[4];
        var writeVRAM = writeCalls[5];
        var writeOAM = writeCalls[6];
        var writeROM = writeCalls[7];
        var writeSRAM = writeCalls[8];
        var code = "address = address | 0;data = data | 0;switch (address >> 24) {";
        /*
         Decoder for the nibble at bits 24-27
         (Top 4 bits of the address falls through to default (unused),
         so the next nibble down is used for dispatch.):
         */
        /*
         BIOS Area (00000000-00003FFF)
         Unused (00004000-01FFFFFF)
         */
        /*
         Unused (00004000-01FFFFFF)
         */
        /*
         WRAM - On-board Work RAM (02000000-0203FFFF)
         Unused (02040000-02FFFFFF)
         */
        code += "case 0x2:{this." + writeExternalWRAM + "(address | 0, data | 0);break};";
        /*
         WRAM - In-Chip Work RAM (03000000-03007FFF)
         Unused (03008000-03FFFFFF)
         */
        code += "case 0x3:{this." + writeInternalWRAM + "(address | 0, data | 0);break};";
        /*
         I/O Registers (04000000-040003FE)
         Unused (04000400-04FFFFFF)
         */
        code += "case 0x4:{this." + writeIODispatch + "(address | 0, data | 0);break};";
        /*
         BG/OBJ Palette RAM (05000000-050003FF)
         Unused (05000400-05FFFFFF)
         */
        code += "case 0x5:{this." + writePalette + "(address | 0, data | 0);break};";
        /*
         VRAM - Video RAM (06000000-06017FFF)
         Unused (06018000-06FFFFFF)
         */
        code += "case 0x6:{this." + writeVRAM + "(address | 0, data | 0);break};";
        /*
         OAM - OBJ Attributes (07000000-070003FF)
         Unused (07000400-07FFFFFF)
         */
        code += "case 0x7:{this." + writeOAM + "(address | 0, data | 0);break};";
        /*
         Game Pak ROM (max 16MB) - Wait State 0 (08000000-08FFFFFF)
         */
        code += "case 0x8:";
        /*
         Game Pak ROM/FlashROM (max 16MB) - Wait State 0 (09000000-09FFFFFF)
         */
        code += "case 0x9:";
        /*
         Game Pak ROM (max 16MB) - Wait State 1 (0A000000-0AFFFFFF)
         */
        code += "case 0xA:";
        /*
         Game Pak ROM/FlashROM (max 16MB) - Wait State 1 (0B000000-0BFFFFFF)
         */
        code += "case 0xB:";
        /*
         Game Pak ROM (max 16MB) - Wait State 2 (0C000000-0CFFFFFF)
         */
        code += "case 0xC:";
        /*
         Game Pak ROM/FlashROM (max 16MB) - Wait State 2 (0D000000-0DFFFFFF)
         */
        code += "case 0xD:{this." + writeROM + "(address | 0, data | 0);break};";
        /*
         Game Pak SRAM  (max 64 KBytes) - 8bit Bus width (0E000000-0E00FFFF)
         */
        code += "case 0xE:";
        /*
         Game Pak SRAM  (max 64 KBytes) - 8bit Bus width (0E000000-0E00FFFF)
         --UNDOCUMENTED MIRROR--
         */
        code += "case 0xF:{this." + writeSRAM + "(address | 0, data | 0);break};";
        /*
         Unused (0F000000-FFFFFFFF)
         */
        code += "default:{this." + writeUnused + "(address | 0, data | 0)}";
        //Generate the function:
        code += "}";
        return Function("address", "data", code);
    }
    GameBoyAdvanceMemory.prototype.memoryReader8Generated = [
                                                             compileMemoryReadDispatch([
                                                                                        "readUnused8",
                                                                                        "readInternalWRAM8",
                                                                                        "readInternalWRAM8",
                                                                                        "readIODispatch8",
                                                                                        "readPalette8",
                                                                                        "readVRAM8",
                                                                                        "readOAM8",
                                                                                        "readROM8",
                                                                                        "readROM28",
                                                                                        "readSRAM8",
                                                                                        "readBIOS8"
                                                                                        ]),
                                                             compileMemoryReadDispatch([
                                                                                        "readUnused8",
                                                                                        "readExternalWRAM8",
                                                                                        "readInternalWRAM8",
                                                                                        "readIODispatch8",
                                                                                        "readPalette8",
                                                                                        "readVRAM8",
                                                                                        "readOAM8",
                                                                                        "readROM8",
                                                                                        "readROM28",
                                                                                        "readSRAM8",
                                                                                        "readBIOS8"
                                                                                        ]),
                                                             compileMemoryReadDispatch([
                                                                                        "readUnused8",
                                                                                        "readUnused8",
                                                                                        "readUnused8",
                                                                                        "readIODispatch8",
                                                                                        "readPalette8",
                                                                                        "readVRAM8",
                                                                                        "readOAM8",
                                                                                        "readROM8",
                                                                                        "readROM28",
                                                                                        "readSRAM8",
                                                                                        "readBIOS8"
                                                                                        ])
                                                             ];
    GameBoyAdvanceMemory.prototype.memoryWriter8Generated = [
                                                             compileMemoryWriteDispatch([
                                                                                         "writeUnused8",
                                                                                         "writeInternalWRAM8",
                                                                                         "writeInternalWRAM8",
                                                                                         "writeIODispatch8",
                                                                                         "writePalette8",
                                                                                         "writeVRAM8",
                                                                                         "writeOAM8",
                                                                                         "writeROM8",
                                                                                         "writeSRAM8"
                                                                                         ]),
                                                             compileMemoryWriteDispatch([
                                                                                         "writeUnused8",
                                                                                         "writeExternalWRAM8",
                                                                                         "writeInternalWRAM8",
                                                                                         "writeIODispatch8",
                                                                                         "writePalette8",
                                                                                         "writeVRAM8",
                                                                                         "writeOAM8",
                                                                                         "writeROM8",
                                                                                         "writeSRAM8"
                                                                                         ]),
                                                             compileMemoryWriteDispatch([
                                                                                         "writeUnused8",
                                                                                         "writeUnused8",
                                                                                         "writeUnused8",
                                                                                         "writeIODispatch8",
                                                                                         "writePalette8",
                                                                                         "writeVRAM8",
                                                                                         "writeOAM8",
                                                                                         "writeROM8",
                                                                                         "writeSRAM8"
                                                                                         ])
                                                             ];
    GameBoyAdvanceMemory.prototype.memoryReader16Generated = [
                                                              compileMemoryReadDispatch([
                                                                                         "readUnused16",
                                                                                         "readInternalWRAM16",
                                                                                         "readInternalWRAM16",
                                                                                         "readIODispatch16",
                                                                                         "readPalette16",
                                                                                         "readVRAM16",
                                                                                         "readOAM16",
                                                                                         "readROM16",
                                                                                         "readROM216",
                                                                                         "readSRAM16",
                                                                                         "readBIOS16"
                                                                                         ]),
                                                              compileMemoryReadDispatch([
                                                                                         "readUnused16",
                                                                                         "readExternalWRAM16",
                                                                                         "readInternalWRAM16",
                                                                                         "readIODispatch16",
                                                                                         "readPalette16",
                                                                                         "readVRAM16",
                                                                                         "readOAM16",
                                                                                         "readROM16",
                                                                                         "readROM216",
                                                                                         "readSRAM16",
                                                                                         "readBIOS16"
                                                                                         ]),
                                                              compileMemoryReadDispatch([
                                                                                         "readUnused16",
                                                                                         "readUnused16",
                                                                                         "readUnused16",
                                                                                         "readIODispatch16",
                                                                                         "readPalette16",
                                                                                         "readVRAM16",
                                                                                         "readOAM16",
                                                                                         "readROM16",
                                                                                         "readROM216",
                                                                                         "readSRAM16",
                                                                                         "readBIOS16"
                                                                                         ])
                                                              ];
    GameBoyAdvanceMemory.prototype.memoryReader16CPUGenerated = [
                                                                 compileMemoryReadDispatch([
                                                                                            "readUnused16CPU",
                                                                                            "readInternalWRAM16CPU",
                                                                                            "readInternalWRAM16CPU",
                                                                                            "readIODispatch16CPU",
                                                                                            "readPalette16CPU",
                                                                                            "readVRAM16CPU",
                                                                                            "readOAM16CPU",
                                                                                            "readROM16CPU",
                                                                                            "readROM216CPU",
                                                                                            "readSRAM16CPU",
                                                                                            "readBIOS16CPU"
                                                                                            ]),
                                                                 compileMemoryReadDispatch([
                                                                                            "readUnused16CPU",
                                                                                            "readExternalWRAM16CPU",
                                                                                            "readInternalWRAM16CPU",
                                                                                            "readIODispatch16CPU",
                                                                                            "readPalette16CPU",
                                                                                            "readVRAM16CPU",
                                                                                            "readOAM16CPU",
                                                                                            "readROM16CPU",
                                                                                            "readROM216CPU",
                                                                                            "readSRAM16CPU",
                                                                                            "readBIOS16CPU"
                                                                                            ]),
                                                                 compileMemoryReadDispatch([
                                                                                            "readUnused16CPU",
                                                                                            "readUnused16CPU",
                                                                                            "readUnused16CPU",
                                                                                            "readIODispatch16CPU",
                                                                                            "readPalette16CPU",
                                                                                            "readVRAM16CPU",
                                                                                            "readOAM16CPU",
                                                                                            "readROM16CPU",
                                                                                            "readROM216CPU",
                                                                                            "readSRAM16CPU",
                                                                                            "readBIOS16CPU"
                                                                                            ])
                                                                 ];
    GameBoyAdvanceMemory.prototype.memoryWriter16Generated = [
                                                              compileMemoryWriteDispatch([
                                                                                          "writeUnused16",
                                                                                          "writeInternalWRAM16",
                                                                                          "writeInternalWRAM16",
                                                                                          "writeIODispatch16",
                                                                                          "writePalette16",
                                                                                          "writeVRAM16",
                                                                                          "writeOAM16",
                                                                                          "writeROM16",
                                                                                          "writeSRAM16"
                                                                                          ]),
                                                              compileMemoryWriteDispatch([
                                                                                          "writeUnused16",
                                                                                          "writeExternalWRAM16",
                                                                                          "writeInternalWRAM16",
                                                                                          "writeIODispatch16",
                                                                                          "writePalette16",
                                                                                          "writeVRAM16",
                                                                                          "writeOAM16",
                                                                                          "writeROM16",
                                                                                          "writeSRAM16"
                                                                                          ]),
                                                              compileMemoryWriteDispatch([
                                                                                          "writeUnused16",
                                                                                          "writeUnused16",
                                                                                          "writeUnused16",
                                                                                          "writeIODispatch16",
                                                                                          "writePalette16",
                                                                                          "writeVRAM16",
                                                                                          "writeOAM16",
                                                                                          "writeROM16",
                                                                                          "writeSRAM16"
                                                                                          ])
                                                              ];
    GameBoyAdvanceMemory.prototype.memoryReader32Generated = [
                                                              compileMemoryReadDispatch([
                                                                                         "readUnused32",
                                                                                         "readInternalWRAM32",
                                                                                         "readInternalWRAM32",
                                                                                         "readIODispatch32",
                                                                                         "readPalette32",
                                                                                         "readVRAM32",
                                                                                         "readOAM32",
                                                                                         "readROM32",
                                                                                         "readROM232",
                                                                                         "readSRAM32",
                                                                                         "readBIOS32"
                                                                                         ]),
                                                              compileMemoryReadDispatch([
                                                                                         "readUnused32",
                                                                                         "readExternalWRAM32",
                                                                                         "readInternalWRAM32",
                                                                                         "readIODispatch32",
                                                                                         "readPalette32",
                                                                                         "readVRAM32",
                                                                                         "readOAM32",
                                                                                         "readROM32",
                                                                                         "readROM232",
                                                                                         "readSRAM32",
                                                                                         "readBIOS32"
                                                                                         ]),
                                                              compileMemoryReadDispatch([
                                                                                         "readUnused32",
                                                                                         "readUnused32",
                                                                                         "readUnused32",
                                                                                         "readIODispatch32",
                                                                                         "readPalette32",
                                                                                         "readVRAM32",
                                                                                         "readOAM32",
                                                                                         "readROM32",
                                                                                         "readROM232",
                                                                                         "readSRAM32",
                                                                                         "readBIOS32"
                                                                                         ])
                                                              ];
    GameBoyAdvanceMemory.prototype.memoryReader32CPUGenerated = [
                                                                 compileMemoryReadDispatch([
                                                                                            "readUnused32CPU",
                                                                                            "readInternalWRAM32CPU",
                                                                                            "readInternalWRAM32CPU",
                                                                                            "readIODispatch32CPU",
                                                                                            "readPalette32CPU",
                                                                                            "readVRAM32CPU",
                                                                                            "readOAM32CPU",
                                                                                            "readROM32CPU",
                                                                                            "readROM232CPU",
                                                                                            "readSRAM32CPU",
                                                                                            "readBIOS32CPU"
                                                                                            ]),
                                                                 compileMemoryReadDispatch([
                                                                                            "readUnused32CPU",
                                                                                            "readExternalWRAM32CPU",
                                                                                            "readInternalWRAM32CPU",
                                                                                            "readIODispatch32CPU",
                                                                                            "readPalette32CPU",
                                                                                            "readVRAM32CPU",
                                                                                            "readOAM32CPU",
                                                                                            "readROM32CPU",
                                                                                            "readROM232CPU",
                                                                                            "readSRAM32CPU",
                                                                                            "readBIOS32CPU"
                                                                                            ]),
                                                                 compileMemoryReadDispatch([
                                                                                            "readUnused32CPU",
                                                                                            "readUnused32CPU",
                                                                                            "readUnused32CPU",
                                                                                            "readIODispatch32CPU",
                                                                                            "readPalette32CPU",
                                                                                            "readVRAM32CPU",
                                                                                            "readOAM32CPU",
                                                                                            "readROM32CPU",
                                                                                            "readROM232CPU",
                                                                                            "readSRAM32CPU",
                                                                                            "readBIOS32CPU"
                                                                                            ])
                                                                 ];
    GameBoyAdvanceMemory.prototype.memoryWriter32Generated = [
                                                              compileMemoryWriteDispatch([
                                                                                          "writeUnused32",
                                                                                          "writeInternalWRAM32",
                                                                                          "writeInternalWRAM32",
                                                                                          "writeIODispatch32",
                                                                                          "writePalette32",
                                                                                          "writeVRAM32",
                                                                                          "writeOAM32",
                                                                                          "writeROM32",
                                                                                          "writeSRAM32"
                                                                                          ]),
                                                              compileMemoryWriteDispatch([
                                                                                          "writeUnused32",
                                                                                          "writeExternalWRAM32",
                                                                                          "writeInternalWRAM32",
                                                                                          "writeIODispatch32",
                                                                                          "writePalette32",
                                                                                          "writeVRAM32",
                                                                                          "writeOAM32",
                                                                                          "writeROM32",
                                                                                          "writeSRAM32"
                                                                                          ]),
                                                              compileMemoryWriteDispatch([
                                                                                          "writeUnused32",
                                                                                          "writeUnused32",
                                                                                          "writeUnused32",
                                                                                          "writeIODispatch32",
                                                                                          "writePalette32",
                                                                                          "writeVRAM32",
                                                                                          "writeOAM32",
                                                                                          "writeROM32",
                                                                                          "writeSRAM32"
                                                                                          ])
                                                              ];
}
generateMemoryTopLevelDispatch();