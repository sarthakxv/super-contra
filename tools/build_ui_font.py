"""Build the panel's original pixel alphabet with Python's standard library.

The slanted 5x7 glyphs interpret the arcade reference; this is not an extracted
Konami font. Run python3 tools/build_ui_font.py to regenerate the TTF.
"""
from pathlib import Path
import struct


ROWS = {
    "A": "01110 10001 10001 11111 10001 10001 10001",
    "B": "11110 10001 10001 11110 10001 10001 11110",
    "C": "01111 10000 10000 10000 10000 10000 01111",
    "D": "11110 10001 10001 10001 10001 10001 11110",
    "E": "11111 10000 10000 11110 10000 10000 11111",
    "F": "11111 10000 10000 11110 10000 10000 10000",
    "G": "01111 10000 10000 10111 10001 10001 01111",
    "H": "10001 10001 10001 11111 10001 10001 10001",
    "I": "11111 00100 00100 00100 00100 00100 11111",
    "J": "00111 00010 00010 00010 10010 10010 01100",
    "K": "10001 10010 10100 11000 10100 10010 10001",
    "L": "10000 10000 10000 10000 10000 10000 11111",
    "M": "10001 11011 10101 10101 10001 10001 10001",
    "N": "10001 11001 11001 10101 10011 10011 10001",
    "O": "01110 10001 10001 10001 10001 10001 01110",
    "P": "11110 10001 10001 11110 10000 10000 10000",
    "Q": "01110 10001 10001 10001 10101 10010 01101",
    "R": "11110 10001 10001 11110 10100 10010 10001",
    "S": "01111 10000 10000 01110 00001 00001 11110",
    "T": "11111 00100 00100 00100 00100 00100 00100",
    "U": "10001 10001 10001 10001 10001 10001 01110",
    "V": "10001 10001 10001 10001 10001 01010 00100",
    "W": "10001 10001 10001 10101 10101 11011 10001",
    "X": "10001 10001 01010 00100 01010 10001 10001",
    "Y": "10001 10001 01010 00100 00100 00100 00100",
    "Z": "11111 00001 00010 00100 01000 10000 11111",
    "0": "01110 10001 10011 10101 11001 10001 01110",
    "1": "00100 01100 00100 00100 00100 00100 01110",
    "2": "01110 10001 00001 00010 00100 01000 11111",
    "3": "11110 00001 00001 01110 00001 00001 11110",
    "4": "00010 00110 01010 10010 11111 00010 00010",
    "5": "11111 10000 10000 11110 00001 00001 11110",
    "6": "01110 10000 10000 11110 10001 10001 01110",
    "7": "11111 00001 00010 00100 01000 01000 01000",
    "8": "01110 10001 10001 01110 10001 10001 01110",
    "9": "01110 10001 10001 01111 00001 00001 01110",
    ".": "00000 00000 00000 00000 00000 00110 00110",
    ",": "00000 00000 00000 00000 00110 00110 00100",
    ":": "00000 00110 00110 00000 00110 00110 00000",
    ";": "00000 00110 00110 00000 00110 00110 00100",
    "!": "00100 00100 00100 00100 00100 00000 00100",
    "?": "01110 10001 00001 00010 00100 00000 00100",
    "-": "00000 00000 00000 11111 00000 00000 00000",
    "_": "00000 00000 00000 00000 00000 00000 11111",
    "/": "00001 00001 00010 00100 01000 10000 10000",
    "\\": "10000 10000 01000 00100 00010 00001 00001",
    "'": "00100 00100 00100 00000 00000 00000 00000",
    '"': "01010 01010 01010 00000 00000 00000 00000",
    "(": "00010 00100 01000 01000 01000 00100 00010",
    ")": "01000 00100 00010 00010 00010 00100 01000",
    "[": "01110 01000 01000 01000 01000 01000 01110",
    "]": "01110 00010 00010 00010 00010 00010 01110",
    "+": "00000 00100 00100 11111 00100 00100 00000",
    "=": "00000 00000 11111 00000 11111 00000 00000",
    ">": "10000 11000 11100 11110 11100 11000 10000",
    "<": "00001 00011 00111 01111 00111 00011 00001",
    "*": "00000 10101 01110 11111 01110 10101 00000",
    "#": "01010 01010 11111 01010 11111 01010 01010",
    "%": "11001 11010 00010 00100 01000 01011 10011",
    "&": "01100 10010 10100 01000 10101 10010 01101",
    "@": "01110 10001 10111 10101 10111 10000 01111",
    "|": "00100 00100 00100 00100 00100 00100 00100",
    " ": "00000 00000 00000 00000 00000 00000 00000",
    "…": "00000 00000 00000 00000 00000 10101 00000",
}


def pack(fmt, *values):
    return struct.pack(">" + fmt, *values)


def glyph(pattern):
    points = []
    for row, line in enumerate(pattern.split()):
        for column, bit in enumerate(line):
            if bit == "1":
                x, y = (column + [2, 2, 1, 1, 1, 0, 0][row]) * 128, (6 - row) * 128
                points.extend([(x, y), (x, y + 128), (x + 128, y + 128), (x + 128, y)])
    if not points:
        return b""
    count = len(points) // 4
    result = pack("hhhhh", count, 0, 0, 896, 896)
    result += pack("H" * count, *range(3, len(points), 4)) + pack("H", 0) + b"\x01" * len(points)
    for axis in [0, 1]:
        previous = 0
        for point in points:
            result += pack("h", point[axis] - previous)
            previous = point[axis]
    return result + b"\0" * (-len(result) % 4)


def checksum(data):
    data += b"\0" * (-len(data) % 4)
    return sum(struct.unpack(">" + "I" * (len(data) // 4), data)) & 0xFFFFFFFF


def build():
    chars = [chr(code) for code in range(32, 127)] + ["’", "…", "·"]
    patterns = [ROWS["?"]] + [ROWS.get(char.upper().replace("’", "'").replace("·", "."), ROWS["?"]) for char in chars]
    outlines = [glyph(pattern) for pattern in patterns]
    offsets, offset = [], 0
    for outline in outlines:
        offsets.append(offset)
        offset += len(outline)
    offsets.append(offset)
    count = len(patterns)
    cmap = {ord(char): i + 1 for i, char in enumerate(chars)}
    codes = sorted(cmap) + [65535]
    segments = len(codes)
    power = 1 << (segments.bit_length() - 1)
    subtable = pack("7H", 4, 16 + segments * 8, 0, segments * 2, power * 2, power.bit_length() - 1, segments * 2 - power * 2)
    subtable += pack("H" * segments, *codes) + pack("H", 0) + pack("H" * segments, *codes)
    subtable += pack("H" * segments, *[(cmap.get(code, 0) - code) & 65535 for code in codes]) + b"\0\0" * segments
    names = {1: "Contra Setup", 2: "Regular", 3: "ContraSetup-1", 4: "Contra Setup", 5: "Version 1.0", 6: "ContraSetup"}
    strings, records = b"", b""
    for name_id, value in names.items():
        encoded = value.encode("utf-16-be")
        records += pack("6H", 3, 1, 0x409, name_id, len(encoded), len(strings))
        strings += encoded
    tables = {
        "head": pack("IIIIHHqqhhhhHHhhh", 0x10000, 0x10000, 0, 0x5F0F3CF5, 3, 1024, 0, 0, 0, 0, 896, 896, 0, 8, 2, 1, 0),
        "hhea": pack("IhhhHhhhhhh4hhH", 0x10000, 896, -128, 0, 1024, 0, 128, 896, 1000, 213, 0, 0, 0, 0, 0, 0, count),
        "maxp": pack("I14H", 0x10000, count, 160, 40, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0),
        "hmtx": pack("Hh", 1024, 0) * count,
        "loca": pack("I" * len(offsets), *offsets),
        "glyf": b"".join(outlines),
        "cmap": pack("HHHHI", 0, 1, 3, 1, 12) + subtable,
        "name": pack("HHH", 0, len(names), 6 + len(records)) + records + strings,
        "post": pack("IihhIIIII", 0x30000, -12 * 65536, -128, 64, 1, 0, 0, 0, 0),
        "OS/2": pack("HhHHH", 0, 1024, 400, 5, 0) + pack("h" * 11, *([0] * 11)) + b"\0" * 10 + pack("4I", 1, 0, 0, 0) + b"CTRA" + pack("HHHhhhHH", 64, 32, 0x2026, 896, -128, 0, 896, 128),
    }
    for tag, size in {"head": 54, "hhea": 36, "maxp": 32, "OS/2": 78, "post": 32}.items():
        assert len(tables[tag]) == size, f"Invalid {tag} table size"
    directory, data, offset = b"", b"", 12 + len(tables) * 16
    font_header = pack("IHHHH", 0x10000, len(tables), 128, 3, len(tables) * 16 - 128)
    head_offset = None
    for tag, content in sorted(tables.items()):
        directory += tag.encode() + pack("III", checksum(content), offset, len(content))
        if tag == "head":
            head_offset = offset
        padded = content + b"\0" * (-len(content) % 4)
        data += padded
        offset += len(padded)
    font = bytearray(font_header + directory + data)
    font[head_offset + 8:head_offset + 12] = pack("I", (0xB1B0AFBA - checksum(font)) & 0xFFFFFFFF)
    assert checksum(font) == 0xB1B0AFBA, "Invalid TrueType checksum"
    target = Path(__file__).resolve().parents[1] / "assets/ui/contra-setup.ttf"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(font)
    print(f"Built {target.name}: {len(font)} bytes")


if __name__ == "__main__":
    build()
