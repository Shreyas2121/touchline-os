use serde::de::{self, Deserializer};
use serde::Deserialize;
use serde_json::Value;

pub fn nullable<'de, T, D>(deserializer: D) -> Result<Option<T>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    match Value::deserialize(deserializer)? {
        Value::Null => Ok(None),
        value => T::deserialize(value).map(Some).map_err(de::Error::custom),
    }
}
