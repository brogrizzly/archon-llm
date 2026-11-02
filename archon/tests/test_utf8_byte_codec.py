from __future__ import annotations

import unittest

from archon.tokenizer import (
    UTF8_BYTE_ALPHABET_SIZE,
    UTF8_BYTE_BOS_ID,
    UTF8_BYTE_EOS_ID,
    UTF8_BYTE_FORMAT,
    Utf8ByteCodec,
    Utf8ByteStreamDecoder,
)


class Utf8ByteCodecTests(unittest.TestCase):
    def setUp(self) -> None:
        self.codec = Utf8ByteCodec()

    def test_codec_is_versioned_and_maps_raw_bytes_directly(self) -> None:
        self.assertEqual(self.codec.format, "archon-utf8-bytes-v1")
        self.assertEqual(UTF8_BYTE_FORMAT, self.codec.format)
        self.assertEqual(UTF8_BYTE_ALPHABET_SIZE, 258)
        self.assertEqual(
            self.codec.to_dict(),
            {
                "format": "archon-utf8-bytes-v1",
                "byte_id_min": 0,
                "byte_id_max": 255,
                "bos_id": 256,
                "eos_id": 257,
                "alphabet_size": 258,
                "normalization": "none",
                "decode_errors": "strict",
            },
        )
        self.assertEqual(self.codec.encode("Tuna"), [256, 84, 117, 110, 97, 257])

    def test_ascii_multiple_scripts_emoji_and_combining_marks_round_trip_exactly(self) -> None:
        samples = (
            "Plain ASCII",
            "Καλημέρα — こんにちは — مرحبًا",
            "🌍👩🏽‍🚀",
            "e\u0301",
        )
        for text in samples:
            with self.subTest(text=text):
                encoded = self.codec.encode(text)
                self.assertEqual(encoded[0], UTF8_BYTE_BOS_ID)
                self.assertEqual(encoded[-1], UTF8_BYTE_EOS_ID)
                self.assertEqual(encoded[1:-1], list(text.encode("utf-8")))
                self.assertEqual(self.codec.decode(encoded), text)

    def test_no_unicode_normalization_is_applied(self) -> None:
        composed = "\u00e9"
        decomposed = "e\u0301"

        self.assertNotEqual(self.codec.encode(composed), self.codec.encode(decomposed))
        self.assertEqual(self.codec.decode(self.codec.encode(decomposed)), decomposed)

    def test_empty_text_has_only_boundary_ids(self) -> None:
        self.assertEqual(self.codec.encode(""), [UTF8_BYTE_BOS_ID, UTF8_BYTE_EOS_ID])
        self.assertEqual(self.codec.decode([UTF8_BYTE_BOS_ID, UTF8_BYTE_EOS_ID]), "")

    def test_literal_boundary_marker_text_is_encoded_as_content(self) -> None:
        text = "literal <BOS> content and <EOS>"
        encoded = self.codec.encode(text)

        self.assertEqual(encoded[0], UTF8_BYTE_BOS_ID)
        self.assertEqual(encoded[-1], UTF8_BYTE_EOS_ID)
        self.assertEqual(encoded[1:-1], list(text.encode("utf-8")))
        self.assertEqual(self.codec.decode(encoded), text)

    def test_streaming_buffers_split_multibyte_sequences(self) -> None:
        encoded = self.codec.encode("A🌍B")
        decoder = Utf8ByteStreamDecoder()

        self.assertEqual(decoder.feed(encoded[:3]), "A")
        self.assertEqual(decoder.feed(encoded[3:5]), "")
        self.assertEqual(decoder.feed(encoded[5:]), "🌍B")
        decoder.finish()

    def test_malformed_bytes_are_rejected(self) -> None:
        malformed = (
            b"\x80",
            b"\xc0\xaf",
            b"\xe2\x82",
            b"\xe2(\xa1",
            b"\xed\xa0\x80",
            b"\xf4\x90\x80\x80",
        )
        for raw in malformed:
            with self.subTest(raw=raw):
                with self.assertRaises(UnicodeDecodeError):
                    self.codec.decode([UTF8_BYTE_BOS_ID, *raw, UTF8_BYTE_EOS_ID])

    def test_unfinished_utf8_is_rejected_on_eos_or_stream_finish(self) -> None:
        with self.assertRaises(UnicodeDecodeError):
            self.codec.decode([UTF8_BYTE_BOS_ID, 0xE2, 0x82, UTF8_BYTE_EOS_ID])

        stream = Utf8ByteStreamDecoder()
        stream.feed([UTF8_BYTE_BOS_ID, 0xE2, 0x82])
        with self.assertRaises(UnicodeDecodeError):
            stream.finish()

    def test_lone_surrogates_are_rejected_without_repair(self) -> None:
        for text in ("\ud800", "\udfff"):
            with self.subTest(text=repr(text)):
                with self.assertRaises(UnicodeEncodeError):
                    self.codec.encode(text)

    def test_encode_and_decode_enforce_raw_byte_limits(self) -> None:
        self.assertEqual(self.codec.encode("", max_bytes=0), [256, 257])
        self.assertEqual(self.codec.decode([256, 257], max_bytes=0), "")
        self.assertEqual(self.codec.encode("é", max_bytes=2), [256, 0xC3, 0xA9, 257])

        with self.assertRaisesRegex(ValueError, "2-byte limit"):
            self.codec.encode("é!", max_bytes=2)
        with self.assertRaisesRegex(ValueError, "2-byte limit"):
            self.codec.decode([256, 0xC3, 0xA9, ord("!"), 257], max_bytes=2)
        with self.assertRaises(UnicodeDecodeError):
            self.codec.decode([256, 0xE2], max_bytes=1)

        for invalid_limit in (-1,):
            with self.subTest(invalid_limit=invalid_limit):
                with self.assertRaises(ValueError):
                    self.codec.encode("", max_bytes=invalid_limit)
        with self.assertRaises(TypeError):
            self.codec.decode([256, 257], max_bytes=True)

    def test_invalid_ids_and_framing_are_rejected(self) -> None:
        invalid_sequences = (
            [0],
            [256, 256],
            [256, 258, 257],
            [256, -1, 257],
            [256, 257, 0],
            [256, True, 257],
            [256, "65", 257],
        )
        for sequence in invalid_sequences:
            with self.subTest(sequence=sequence):
                with self.assertRaises(ValueError):
                    self.codec.decode(sequence)

        with self.assertRaisesRegex(ValueError, "end with EOS"):
            self.codec.decode([256, ord("A")])

        stream = Utf8ByteStreamDecoder()
        with self.assertRaisesRegex(ValueError, "begin with BOS"):
            stream.finish()


if __name__ == "__main__":
    unittest.main()
