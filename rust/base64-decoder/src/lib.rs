use wasm_bindgen::prelude::*;

fn decode_char(ch: char) -> Option<u8> {
    match ch {
        'A'..='Z' => Some((ch as u8) - b'A'),
        'a'..='z' => Some((ch as u8) - b'a' + 26),
        '0'..='9' => Some((ch as u8) - b'0' + 52),
        '+' => Some(62),
        '/' => Some(63),
        '=' => Some(255),
        _ => None,
    }
}

#[wasm_bindgen]
pub fn decode_base64(encoded: &str) -> Result<Vec<u8>, JsValue> {
    if encoded.len() % 4 != 0 {
        return Err(JsValue::from_str(&format!(
            "Invalid length for base64 encoded string. Expected length % 4 = 0, got length = {}",
            encoded.len()
        )));
    }

    let chars: Vec<char> = encoded.chars().collect();
    let quartet_count = chars.len() / 4;

    let byte_count = if chars.len() >= 4 {
        if chars[chars.len() - 1] == '=' {
            if chars[chars.len() - 2] == '=' {
                quartet_count * 3 - 2
            } else {
                quartet_count * 3 - 1
            }
        } else {
            quartet_count * 3
        }
    } else {
        quartet_count * 3
    };

    let mut bytes = Vec::with_capacity(byte_count);

    for quartet_index in 0..quartet_count {
        let base = quartet_index * 4;
        let enc1 = chars[base];
        let enc2 = chars[base + 1];
        let enc3 = chars[base + 2];
        let enc4 = chars[base + 3];

        let sextet1 = decode_char(enc1);
        let sextet2 = decode_char(enc2);
        let sextet3 = decode_char(enc3);
        let sextet4 = decode_char(enc4);

        if sextet1.is_none() || sextet2.is_none() || sextet3.is_none() || sextet4.is_none() {
            return Err(JsValue::from_str(&format!(
                "Invalid quartet at indices {} .. {}: {}",
                base,
                base + 3,
                chars[base..base + 4].iter().collect::<String>()
            )));
        }

        let sextet1 = sextet1.unwrap();
        let sextet2 = sextet2.unwrap();
        let sextet3 = sextet3.unwrap();
        let sextet4 = sextet4.unwrap();

        bytes.push((sextet1 << 2) | (sextet2 >> 4));
        if enc3 != '=' {
            bytes.push(((sextet2 & 15) << 4) | (sextet3 >> 2));
        }
        if enc4 != '=' {
            bytes.push(((sextet3 & 7) << 6) | sextet4);
        }
    }

    if bytes.len() != byte_count {
        return Err(JsValue::from_str(&format!(
            "Expected to decode {} bytes, but only decoded {})",
            byte_count,
            bytes.len()
        )));
    }

    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::decode_base64;

    #[test]
    fn decodes_standard_base64() {
        assert_eq!(decode_base64("aGVsbG8=").unwrap(), b"hello");
    }

    #[test]
    fn rejects_invalid_length() {
        let error = decode_base64("abc").unwrap_err();
        assert!(error.as_string().unwrap().contains("Expected length % 4 = 0"));
    }
}
