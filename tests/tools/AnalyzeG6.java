import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.listing.Function;
import java.io.FileWriter;

// Run as a Ghidra post-script on tests/original/backup1.bin imported at 0x06000000
// with OpenRISC:LE:32:default. The Ghidra project can live outside this repo.
public class AnalyzeG6 extends GhidraScript {
    @Override
    public void run() throws Exception {
        Memory memory = currentProgram.getMemory();
        Object[][] maps = {
            {"SRAM_boot_copy", 0x00000000L, 0x06000200L, 0x2c00L},
            {"RAM_update_copy", 0x02000000L, 0x06002e00L, 0x7800L},
        };
        for (Object[] map : maps) {
            try {
                if (memory.getBlock((String)map[0]) != null) continue;
                MemoryBlock block = memory.createByteMappedBlock((String)map[0], toAddr((Long)map[1]), toAddr((Long)map[2]), (Long)map[3], false);
                block.setExecute(true);
                println("Mapped " + map[0]);
            } catch (Exception e) { println("Map " + map[0] + ": " + e); }
        }
        String[][] items = {
            {"0x0000086c", "gpio_like_set_mask"},
            {"0x000008f8", "gpio_like_read_mask"},
            {"0x0000097c", "gpio_like_pin_reader"},
            {"0x02002cac", "gpio_set_mask_ram"},
            {"0x0600a9d8", "driver_dispatch"},
            {"0x060156d4", "lcd_control"},
            {"0x060157c0", "led_control"},
            {"0x06014dd0", "ir_control"},
            {"0x0604083c", "lcd_state"},
            {"0x060408b0", "lcd_state_machine"},
            {"0x06040068", "power_key_event"},
            {"0x06040cd8", "ir_state"},
            {"0x06045f04", "led_blink_callback"},
            {"0x06048294", "video_tick_led"},
            {"0x060488a0", "video_filter_hold"},
            {"0x06046eb8", "photo_filter_hold"},
            {"0x06046f98", "photo_capture"},
            {"0x06046c20", "photo_ir_mode"},
            {"0x060398e4", "filter_cycle"},
            {"0x06046980", "photo_filter_decrement_event"},
            {"0x06048390", "video_filter_decrement_event"},
            {"0x06016ecc", "sensor_control"},
            {"0x06059478", "filter_apply"},
            {"0x0604ddc8", "filter_lut_write"},
            {"0x0604e6ac", "filter_byte_stage"},
            {"0x06053340", "filter_byte_stage_input"},
            {"0x0605544c", "device_copy"},
            {"0x0603932c", "shutdown"},
            {"0x06028140", "delay_ticks"},
            {"0x020019a0", "sd_update_worker"},
            {"0x06013108", "file_read"},
            {"0x0601322c", "file_seek"},
        };
        DecompInterface decomp = new DecompInterface();
        decomp.openProgram(currentProgram);
        try (FileWriter f = new FileWriter("tests/analysis/ghidra_focus.txt")) {
            for (String[] item : items) {
                try {
                    disassemble(toAddr(item[0]));
                    Function function = getFunctionAt(toAddr(item[0]));
                    if (function == null) function = createFunction(toAddr(item[0]), item[1]);
                    f.write("\n===== " + item[1] + " " + item[0] + " =====\n");
                    if (function == null) { f.write("No function created\n"); continue; }
                    DecompileResults result = decomp.decompileFunction(function, 90, monitor);
                    if (result.decompileCompleted()) f.write(result.getDecompiledFunction().getC());
                    else f.write("Decompiler failed: " + result.getErrorMessage() + "\n");
                } catch (Exception e) { f.write("Error: " + e + "\n"); }
            }
        }
        decomp.dispose();
    }
}
