//! Shared storage representation. Domain and snapshot validation remain at their
//! existing boundaries; this module only converts the mapped column kinds.
use super::{invalid, Kind, Result, Table};
use rusqlite::{types::Value as SqlValue, Row};
use serde_json::{Map, Value};

fn encode(value: &Value, kind: Kind) -> Result<SqlValue> {
    if value.is_null() {
        return Ok(SqlValue::Null);
    }
    Ok(match kind {
        Kind::Text => SqlValue::Text(value.as_str().ok_or_else(|| invalid("text column"))?.into()),
        Kind::Integer => {
            SqlValue::Integer(value.as_i64().ok_or_else(|| invalid("integer column"))?)
        }
        Kind::Bool => SqlValue::Integer(i64::from(
            value.as_bool().ok_or_else(|| invalid("bool column"))?,
        )),
        Kind::Json => SqlValue::Text(serde_json::to_string(value)?),
    })
}

fn decode(row: &Row<'_>, index: usize, kind: Kind) -> Result<Value> {
    Ok(match kind {
        Kind::Text => row
            .get::<_, Option<String>>(index)?
            .map_or(Value::Null, Value::from),
        Kind::Integer => row
            .get::<_, Option<i64>>(index)?
            .map_or(Value::Null, Value::from),
        Kind::Bool => row
            .get::<_, Option<bool>>(index)?
            .map_or(Value::Null, Value::from),
        Kind::Json => match row.get::<_, Option<String>>(index)? {
            Some(text) => serde_json::from_str(&text)?,
            None => Value::Null,
        },
    })
}

pub(super) fn encode_row(table: &Table, row: &Value) -> Result<Vec<SqlValue>> {
    table
        .columns
        .iter()
        .map(|column| encode(&row[column.name], column.kind))
        .collect()
}

pub(super) fn decode_row(table: &Table, row: &Row<'_>) -> Result<Value> {
    let mut object = Map::new();
    for (index, column) in table.columns.iter().enumerate() {
        object.insert(column.name.into(), decode(row, index, column.kind)?);
    }
    Ok(Value::Object(object))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};
    use serde_json::json;

    #[test]
    fn round_trips_all_column_kinds_and_nulls() {
        let db = Connection::open_in_memory().unwrap();
        let mut statement = db.prepare("SELECT ?1").unwrap();
        for (kind, values) in [
            (Kind::Text, vec![json!(""), json!("quoted ' text 🏟")]),
            (
                Kind::Integer,
                vec![
                    json!(0),
                    json!(-9007199254740991_i64),
                    json!(9007199254740991_i64),
                ],
            ),
            (Kind::Bool, vec![json!(false), json!(true)]),
            (
                Kind::Json,
                vec![
                    json!({"nested":[null, false, 0, "text"]}),
                    json!([]),
                    json!("null"),
                    json!(false),
                    json!(42),
                ],
            ),
        ] {
            for value in values.into_iter().chain([Value::Null]) {
                let encoded = encode(&value, kind).unwrap();
                let mut rows = statement.query(params![encoded]).unwrap();
                assert_eq!(
                    decode(rows.next().unwrap().unwrap(), 0, kind).unwrap(),
                    value
                );
            }
        }
    }

    #[test]
    fn malformed_values_still_fail_conversion() {
        for (value, kind) in [
            (json!(1), Kind::Text),
            (json!("1"), Kind::Integer),
            (json!(1.5), Kind::Integer),
            (json!(true), Kind::Integer),
            (json!(1), Kind::Bool),
            (json!("false"), Kind::Bool),
        ] {
            assert!(encode(&value, kind).is_err());
        }
        let db = Connection::open_in_memory().unwrap();
        for (sql, kind) in [
            ("SELECT 'not json'", Kind::Json),
            ("SELECT '1.5'", Kind::Integer),
            ("SELECT 1.5", Kind::Integer),
            ("SELECT 'true'", Kind::Bool),
            ("SELECT 12", Kind::Text),
            ("SELECT x'00'", Kind::Json),
        ] {
            let mut statement = db.prepare(sql).unwrap();
            let mut rows = statement.query([]).unwrap();
            assert!(
                decode(rows.next().unwrap().unwrap(), 0, kind).is_err(),
                "{sql}"
            );
        }
    }
}
