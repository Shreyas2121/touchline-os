use serde::de::{self, Deserializer, Visitor};
use serde::{Deserialize, Serialize, Serializer};
use std::fmt;
use ts_rs::TS;

pub const JS_MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, Copy, PartialEq, Eq, TS)]
#[ts(type = "number")]
pub struct SafeInt(i64);

impl SafeInt {
    pub const fn get(self) -> i64 {
        self.0
    }
}

impl Serialize for SafeInt {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_i64(self.0)
    }
}

impl<'de> Deserialize<'de> for SafeInt {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(IntegerVisitor {
            reject: "unsafe integer",
            non_negative: false,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, TS)]
#[ts(type = "number")]
pub struct MoneyCents(i64);

impl MoneyCents {
    pub const fn get(self) -> i64 {
        self.0
    }
}

impl Serialize for MoneyCents {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_i64(self.0)
    }
}

impl<'de> Deserialize<'de> for MoneyCents {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let number = deserializer.deserialize_any(IntegerVisitor {
            reject: "unsafe money",
            non_negative: true,
        })?;
        Ok(MoneyCents(number.0))
    }
}

struct IntegerVisitor {
    reject: &'static str,
    non_negative: bool,
}

impl Visitor<'_> for IntegerVisitor {
    type Value = SafeInt;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a JS-safe integer")
    }

    fn visit_i64<E: de::Error>(self, value: i64) -> Result<Self::Value, E> {
        if !(-JS_MAX_SAFE_INTEGER..=JS_MAX_SAFE_INTEGER).contains(&value) {
            return Err(E::custom(self.reject));
        }
        if self.non_negative && value < 0 {
            return Err(E::custom(self.reject));
        }
        Ok(SafeInt(value))
    }

    fn visit_u64<E: de::Error>(self, value: u64) -> Result<Self::Value, E> {
        if value > JS_MAX_SAFE_INTEGER as u64 {
            return Err(E::custom(self.reject));
        }
        self.visit_i64(value as i64)
    }

    fn visit_f64<E: de::Error>(self, _value: f64) -> Result<Self::Value, E> {
        Err(E::custom(self.reject))
    }
}
