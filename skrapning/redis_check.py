import redis
import json

# Anslutning
r = redis.Redis(
    host='redis-12352.fcrce259.eu-central-1-3.ec2.cloud.redislabs.com',
    port=12352,
    username='default',
    password='Ma!!orca123',
    decode_responses=True
)

def check_key(key):
    ttl = r.ttl(key)
    value = r.get(key)

    print(f"\n🔑 Nyckel: {key}")
    print(f"⏱ TTL: {'Ingen satt' if ttl == -1 else f'{ttl} sek'}")

    try:
        data = json.loads(value)
        print("📦 Innehåll: JSON-struktur")
        # Kolla innehåll lite snabbt
        if isinstance(data, dict):
            keys = list(data.keys())
            print(f"   ➤ Fält: {keys}")
            if 'id' not in data:
                print("   ⚠️ Saknar 'id'-fält?")
        else:
            print("   ➤ JSON är inte ett dict/objekt?")
    except Exception:
        print("📄 Innehåll: (sträng eller binärt)")
        if len(value) > 100:
            print("   ➤ Trunkeras...")
            print(value[:100] + "...")
        else:
            print(f"   ➤ {value}")

def main():
    try:
        keys = r.keys('*')  # Alla nycklar
        print(f"Hittade {len(keys)} nycklar")
        for key in keys:
            check_key(key)
    except Exception as e:
        print("❌ Fel:", e)

if __name__ == "__main__":
    main()
