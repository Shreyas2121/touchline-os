use serde::de::{self, Deserializer, Visitor};
use serde::{Deserialize, Serialize, Serializer};
use std::fmt;
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, TS)]
#[ts(type = "string")]
pub struct EntityId(String);

impl EntityId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Serialize for EntityId {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for EntityId {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_string(IdVisitor)
    }
}

struct IdVisitor;

impl Visitor<'_> for IdVisitor {
    type Value = EntityId;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("an entity id")
    }

    fn visit_str<E: de::Error>(self, value: &str) -> Result<Self::Value, E> {
        if !is_entity_id(value) {
            return Err(E::custom("malformed id"));
        }
        Ok(EntityId(value.to_owned()))
    }
}

pub fn is_entity_id(value: &str) -> bool {
    let length = value.chars().count();
    (1..=64).contains(&length)
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, TS)]
#[ts(type = "1")]
pub struct FormatVersion;

impl Serialize for FormatVersion {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_u8(1)
    }
}

impl<'de> Deserialize<'de> for FormatVersion {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = crate::numbers::SafeInt::deserialize(deserializer)?;
        if value.get() != 1 {
            return Err(de::Error::custom("unsupported version"));
        }
        Ok(FormatVersion)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, TS)]
#[ts(type = "\"1\"")]
pub struct VersionOne;

impl Serialize for VersionOne {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str("1")
    }
}

impl<'de> Deserialize<'de> for VersionOne {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = String::deserialize(deserializer)?;
        if value != "1" {
            return Err(de::Error::custom("invalid enum"));
        }
        Ok(VersionOne)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, TS)]
#[ts(type = "\"EUR\"")]
pub struct Euro;

impl Serialize for Euro {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str("EUR")
    }
}

impl<'de> Deserialize<'de> for Euro {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = String::deserialize(deserializer)?;
        if value != "EUR" {
            return Err(de::Error::custom("invalid enum"));
        }
        Ok(Euro)
    }
}
