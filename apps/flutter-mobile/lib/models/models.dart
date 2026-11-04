class MobileVenue {
  final String id;
  final String name;
  final String slug;
  final String city;
  final String address;
  final double rating;
  final bool openNow;
  final String closingTime;
  final int baseHourlyRate;
  final String bannerImage;
  final List<String> tags;
  final int totalStations;
  final int availableStations;

  MobileVenue({
    required this.id,
    required this.name,
    required this.slug,
    required this.city,
    required this.address,
    required this.rating,
    required this.openNow,
    required this.closingTime,
    required this.baseHourlyRate,
    required this.bannerImage,
    required this.tags,
    required this.totalStations,
    required this.availableStations,
  });
}

class StationItem {
  final String id;
  final String name;
  final String zone;
  final String hardware;
  final String gpu;
  final String peripherals;
  final int hourlyRate; // in bani
  final String status; // 'AVAILABLE' | 'OCCUPIED'

  StationItem({
    required this.id,
    required this.name,
    required this.zone,
    required this.hardware,
    required this.gpu,
    required this.peripherals,
    required this.hourlyRate,
    required this.status,
  });
}

class BarMenuItem {
  final String id;
  final String name;
  final String category; // 'ENERGY' | 'SNACK' | 'DRINK' | 'HOT_FOOD'
  final int price; // in bani (100 = 1 RON)
  final bool requiresAgeVerification;
  final String imageIcon;
  final bool inStock;

  BarMenuItem({
    required this.id,
    required this.name,
    required this.category,
    required this.price,
    required this.requiresAgeVerification,
    required this.imageIcon,
    required this.inStock,
  });
}

class BarOrder {
  final String id;
  final String bookingId;
  final String stationName;
  final List<OrderItem> items;
  final int totalAmount;
  final String crockfordCode;
  String status; // 'PLACED' | 'PREPARING' | 'READY' | 'HANDED_OFF'
  final String placedAt;

  BarOrder({
    required this.id,
    required this.bookingId,
    required this.stationName,
    required this.items,
    required this.totalAmount,
    required this.crockfordCode,
    required this.status,
    required this.placedAt,
  });
}

class OrderItem {
  final BarMenuItem item;
  final int quantity;

  OrderItem({required this.item, required this.quantity});
}
